/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import * as domStylesheets from '../../../../base/browser/domStylesheets.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { URI } from '../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ConfirmResult } from '../../../../platform/dialogs/common/dialogs.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ILifecycleService } from '../../../services/lifecycle/common/lifecycle.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { TerminalLocation } from '../../../../platform/terminal/common/terminal.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { EditorExtensions, EditorInputCapabilities, IEditorFactoryRegistry, IEditorOpenContext, IEditorSerializer } from '../../../common/editor.js';
import { EditorInput, IEditorCloseHandler } from '../../../common/editor/editorInput.js';
import { IEditorGroup, IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ITerminalGroupService, ITerminalService } from '../../terminal/browser/terminal.js';
import { TerminalTabbedView } from '../../terminal/browser/terminalTabbedView.js';
import { TerminalThemeIconStyle } from '../../terminal/browser/terminalView.js';

const TERMINAL_HOME_EDITOR_ID = 'workbench.editor.didaTerminalHome';
const TERMINAL_HOME_INPUT_ID = 'workbench.input.didaTerminalHome';
const TERMINAL_HOME_RESOURCE = URI.from({ scheme: 'dida-terminal-home', path: '/home' });

/**
 * The always-present "Terminal" tab hosting the full terminal view (tabs
 * list, splits, all terminal commands). The tab itself cannot be closed;
 * when the last terminal exits a placeholder offers to open a new one.
 */
class TerminalHomeInput extends EditorInput implements IEditorCloseHandler {

	static readonly ID = TERMINAL_HOME_INPUT_ID;

	override readonly closeHandler = this;

	readonly resource = TERMINAL_HOME_RESOURCE;

	private _isShuttingDown = false;

	constructor(
		@ILifecycleService lifecycleService: ILifecycleService,
	) {
		super();
		this._register(lifecycleService.onWillShutdown(() => { this._isShuttingDown = true; }));
	}

	override get typeId(): string {
		return TerminalHomeInput.ID;
	}

	override get editorId(): string {
		return TERMINAL_HOME_EDITOR_ID;
	}

	override get capabilities(): EditorInputCapabilities {
		return EditorInputCapabilities.Readonly | EditorInputCapabilities.Singleton | EditorInputCapabilities.ForceReveal;
	}

	override getName(): string {
		return localize('terminalHome', "Terminal");
	}

	override matches(other: EditorInput): boolean {
		return other instanceof TerminalHomeInput;
	}

	showConfirm(): boolean {
		// veto interactive closing; shutdown takes a different path but stay
		// out of its way regardless
		return !this._isShuttingDown;
	}

	async confirm(): Promise<ConfirmResult> {
		// the terminal home tab cannot be closed
		return ConfirmResult.CANCEL;
	}
}

class TerminalHomePane extends EditorPane {

	static readonly ID = TERMINAL_HOME_EDITOR_ID;

	private container: HTMLElement | undefined;
	private tabbedView: TerminalTabbedView | undefined;
	private placeholder: HTMLElement | undefined;
	private lastDimension: dom.Dimension | undefined;
	private creatingInitialTerminal = false;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@ITerminalService private readonly terminalService: ITerminalService,
		@ITerminalGroupService private readonly terminalGroupService: ITerminalGroupService,
		@IEditorService private readonly editorService: IEditorService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super(TerminalHomePane.ID, group, telemetryService, themeService, storageService);

		this.terminalGroupService.panelOverride = {
			isVisible: () => this.isVisible(),
			reveal: async () => {
				if (this.input) {
					await this.editorService.openEditor(this.input, { pinned: true, sticky: true });
				}
			}
		};

		this._register(this.terminalGroupService.onDidChangeInstances(() => {
			this.updatePlaceholder();
			this.ensureTabbedView();
			this.relayout();
		}));
	}

	protected createEditor(parent: HTMLElement): void {
		// pane-body scopes the upstream terminal CSS (height, backgrounds,
		// tabs) which is written for the terminal view pane
		this.container = dom.append(parent, dom.$('.dida-terminal-home.pane-body.integrated-terminal'));
		this.container.style.width = '100%';
		this.container.style.height = '100%';
		this.container.style.position = 'relative';
		domStylesheets.createStyleSheet(this.container);
		this._register(this.instantiationService.createInstance(TerminalThemeIconStyle, this.container));

		this.placeholder = dom.append(this.container, dom.$('.dida-terminal-home-placeholder'));
		this.placeholder.style.position = 'absolute';
		this.placeholder.style.inset = '0';
		this.placeholder.style.display = 'none';
		this.placeholder.style.alignItems = 'center';
		this.placeholder.style.justifyContent = 'center';
		this.placeholder.style.zIndex = '10';
		this.placeholder.style.background = 'var(--vscode-editor-background)';

		const button = dom.append(this.placeholder, dom.$('button.monaco-button'));
		button.textContent = localize('openTerminal', "Open Terminal");
		button.style.padding = '8px 20px';
		button.style.cursor = 'pointer';
		button.style.background = 'var(--vscode-button-background)';
		button.style.color = 'var(--vscode-button-foreground)';
		button.style.border = 'none';
		button.style.borderRadius = '3px';
		this._register(dom.addDisposableListener(button, 'click', () => this.createTerminal()));
	}

	override async setInput(input: EditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);
		if (this.terminalGroupService.instances.length === 0 && this.terminalService.restoredGroupCount === 0) {
			await this.createTerminal();
		} else {
			this.ensureTabbedView();
		}
		this.updatePlaceholder();
		this.terminalGroupService.updateVisibility();
	}

	private async createTerminal(): Promise<void> {
		if (this.creatingInitialTerminal) {
			return;
		}
		this.creatingInitialTerminal = true;
		try {
			await this.terminalService.createTerminal({ location: TerminalLocation.Panel });
		} finally {
			this.creatingInitialTerminal = false;
		}
		this.ensureTabbedView();
		this.updatePlaceholder();
		this.relayout();
	}

	private relayout(): void {
		if (this.lastDimension) {
			this.tabbedView?.layout(this.lastDimension.width, this.lastDimension.height);
		}
	}

	private ensureTabbedView(): void {
		if (this.tabbedView || !this.container) {
			return;
		}
		this.tabbedView = this._register(this.instantiationService.createInstance(TerminalTabbedView, this.container));
		if (this.lastDimension) {
			this.tabbedView.layout(this.lastDimension.width, this.lastDimension.height);
		}
	}

	private updatePlaceholder(): void {
		if (!this.placeholder) {
			return;
		}
		const empty = this.terminalGroupService.instances.length === 0;
		this.placeholder.style.display = empty ? 'flex' : 'none';
	}

	override layout(dimension: dom.Dimension): void {
		this.lastDimension = dimension;
		this.tabbedView?.layout(dimension.width, dimension.height);
	}

	protected override setEditorVisible(visible: boolean): void {
		super.setEditorVisible(visible);
		this.terminalGroupService.updateVisibility();
	}

	override focus(): void {
		super.focus();
		this.terminalGroupService.activeInstance?.focus(true);
	}

	override dispose(): void {
		this.terminalGroupService.panelOverride = undefined;
		super.dispose();
	}
}

class TerminalHomeInputSerializer implements IEditorSerializer {

	canSerialize(editorInput: EditorInput): boolean {
		return editorInput instanceof TerminalHomeInput;
	}

	serialize(editorInput: EditorInput): string | undefined {
		return editorInput instanceof TerminalHomeInput ? '{}' : undefined;
	}

	deserialize(instantiationService: IInstantiationService): EditorInput | undefined {
		return instantiationService.createInstance(TerminalHomeInput);
	}
}

/**
 * Ensures the terminal home tab exists as the first, sticky editor of the
 * first group.
 */
class TerminalHomeContribution implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.didaTerminalHome';

	constructor(
		@IEditorService editorService: IEditorService,
		@IEditorGroupsService editorGroupsService: IEditorGroupsService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		const existing = editorService.editors.find(editor => editor instanceof TerminalHomeInput);
		if (existing) {
			return;
		}

		const group = editorGroupsService.groups[0];
		const input = instantiationService.createInstance(TerminalHomeInput);
		group.openEditor(input, { pinned: true, sticky: true, index: 0, preserveFocus: group.count > 0 });
	}
}

registerAction2(class FocusTerminalHomeAction extends Action2 {
	constructor() {
		super({
			id: 'dida.terminal.focusHome',
			title: localize2('focusTerminalHome', "Focus Terminal Tab"),
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib + 1,
				primary: KeyMod.CtrlCmd | KeyCode.Backquote
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const editorGroupsService = accessor.get(IEditorGroupsService);
		const instantiationService = accessor.get(IInstantiationService);

		const existing = editorService.editors.find(editor => editor instanceof TerminalHomeInput);
		const input = existing ?? instantiationService.createInstance(TerminalHomeInput);
		await editorGroupsService.groups[0].openEditor(input, { pinned: true, sticky: true, index: 0 });
	}
});

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		TerminalHomePane,
		TerminalHomePane.ID,
		localize('terminalHome', "Terminal")
	),
	[new SyncDescriptor(TerminalHomeInput)]
);

Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(TerminalHomeInput.ID, TerminalHomeInputSerializer);

registerWorkbenchContribution2(TerminalHomeContribution.ID, TerminalHomeContribution, WorkbenchPhase.AfterRestored);
