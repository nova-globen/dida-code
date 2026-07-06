/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { renderMarkdown } from '../../../../base/browser/markdownRenderer.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { basename } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition, OverlayWidgetPositionPreference } from '../../../../editor/browser/editorBrowser.js';
import { EditorContributionInstantiation, registerEditorContribution } from '../../../../editor/browser/editorExtensions.js';
import { IEditorContribution } from '../../../../editor/common/editorCommon.js';
import { localize } from '../../../../nls.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { DEFAULT_EDITOR_ASSOCIATION, EditorExtensions, EditorInputCapabilities, IEditorFactoryRegistry, IEditorOpenContext, IEditorSerializer } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';

const MARKDOWN_PREVIEW_EDITOR_ID = 'workbench.editor.didaMarkdownPreview';
const MARKDOWN_PREVIEW_INPUT_ID = 'workbench.input.didaMarkdownPreview';

class MarkdownPreviewInput extends EditorInput {

	static readonly ID = MARKDOWN_PREVIEW_INPUT_ID;

	constructor(readonly resource: URI) {
		super();
	}

	override get typeId(): string {
		return MarkdownPreviewInput.ID;
	}

	override get editorId(): string {
		return MARKDOWN_PREVIEW_EDITOR_ID;
	}

	override get capabilities(): EditorInputCapabilities {
		return EditorInputCapabilities.Readonly;
	}

	override getName(): string {
		return basename(this.resource);
	}

	override matches(other: EditorInput): boolean {
		return other instanceof MarkdownPreviewInput && other.resource.toString() === this.resource.toString();
	}
}

/**
 * Creates the [Edit | Preview] switcher shown at the bottom of markdown
 * editors and previews.
 */
function createModeSwitcher(active: 'edit' | 'preview', onEdit: () => void, onPreview: () => void): HTMLElement {
	const bar = dom.$('.dida-md-switcher');
	bar.style.display = 'flex';
	bar.style.flex = '0 0 auto';
	bar.style.gap = '2px';
	bar.style.padding = '2px 8px';
	bar.style.fontSize = '12px';
	bar.style.userSelect = 'none';
	bar.style.borderTop = '1px solid var(--vscode-editorGroup-border)';
	bar.style.background = 'var(--vscode-editorGroupHeader-tabsBackground)';

	for (const [mode, label, handler] of [['edit', localize('mdEdit', "Edit"), onEdit], ['preview', localize('mdPreview', "Preview"), onPreview]] as const) {
		const tab = dom.append(bar, dom.$('span.dida-md-switcher-tab'));
		tab.textContent = label;
		tab.style.padding = '2px 10px';
		tab.style.cursor = 'pointer';
		tab.style.borderRadius = '3px 3px 0 0';
		if (mode === active) {
			tab.style.background = 'var(--vscode-tab-activeBackground)';
			tab.style.color = 'var(--vscode-tab-activeForeground)';
			tab.style.borderBottom = '2px solid var(--vscode-focusBorder)';
		} else {
			tab.style.color = 'var(--vscode-tab-inactiveForeground)';
		}
		tab.addEventListener('click', handler);
	}

	return bar;
}

class MarkdownPreviewEditorPane extends EditorPane {

	static readonly ID = MARKDOWN_PREVIEW_EDITOR_ID;

	private container: HTMLElement | undefined;
	private contentElement: HTMLElement | undefined;
	private readonly inputDisposables = this._register(new DisposableStore());
	private readonly contentDisposables = this._register(new DisposableStore());

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IFileService private readonly fileService: IFileService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IEditorService private readonly editorService: IEditorService,
	) {
		super(MarkdownPreviewEditorPane.ID, group, telemetryService, themeService, storageService);
	}

	protected createEditor(parent: HTMLElement): void {
		this.container = dom.append(parent, dom.$('.dida-md-preview'));
		this.container.style.position = 'relative';
		this.container.style.width = '100%';
		this.container.style.height = '100%';

		this.contentElement = dom.append(this.container, dom.$('.dida-md-preview-content'));
		this.contentElement.style.width = '100%';
		this.contentElement.style.height = '100%';
		this.contentElement.style.overflow = 'auto';
		this.contentElement.style.padding = '0 26px 40px 26px';
		this.contentElement.style.maxWidth = '60em';
		this.contentElement.style.lineHeight = '1.6';

		// anchored bottom-right to match the switcher overlay in the text editor
		const switcher = this.container.appendChild(createModeSwitcher('preview',
			() => this.switchToEdit(),
			() => { /* already in preview */ }
		));
		switcher.style.position = 'absolute';
		switcher.style.right = '14px';
		switcher.style.bottom = '0';
		switcher.style.borderTop = 'none';
		switcher.style.border = '1px solid var(--vscode-editorGroup-border)';
		switcher.style.borderRadius = '4px 4px 0 0';
	}

	override async setInput(input: EditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);

		if (!(input instanceof MarkdownPreviewInput) || !this.contentElement) {
			return;
		}

		this.inputDisposables.clear();
		await this.render(input.resource, token);

		// live-update the preview when the file changes on disk
		const watcher = this.inputDisposables.add(this.fileService.createWatcher(input.resource, { recursive: false, excludes: [] }));
		this.inputDisposables.add(watcher.onDidChange(() => this.render(input.resource, CancellationToken.None)));
	}

	private async render(resource: URI, token: CancellationToken): Promise<void> {
		const content = await this.fileService.readFile(resource);
		if (token.isCancellationRequested || !this.contentElement) {
			return;
		}

		this.contentDisposables.clear();
		dom.clearNode(this.contentElement);
		const rendered = renderMarkdown(new MarkdownString(content.value.toString(), { supportHtml: false, isTrusted: false }), {
			actionHandler: (linkContent: string) => { this.openerService.open(linkContent, { allowCommands: false }); }
		});
		this.contentDisposables.add(rendered);
		this.contentElement.appendChild(rendered.element);
	}

	private switchToEdit(): void {
		const input = this.input;
		if (!(input instanceof MarkdownPreviewInput)) {
			return;
		}
		this.editorService.replaceEditors([{
			editor: input,
			replacement: { resource: input.resource, options: { override: DEFAULT_EDITOR_ASSOCIATION.id } }
		}], this.group);
	}

	override clearInput(): void {
		this.inputDisposables.clear();
		this.contentDisposables.clear();
		if (this.contentElement) {
			dom.clearNode(this.contentElement);
		}
		super.clearInput();
	}

	override layout(dimension: dom.Dimension): void {
		// flex layout adapts on its own
	}
}

class MarkdownPreviewInputSerializer implements IEditorSerializer {

	canSerialize(editorInput: EditorInput): boolean {
		return editorInput instanceof MarkdownPreviewInput;
	}

	serialize(editorInput: EditorInput): string | undefined {
		if (!(editorInput instanceof MarkdownPreviewInput)) {
			return undefined;
		}
		return JSON.stringify({ resource: editorInput.resource.toString() });
	}

	deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): EditorInput | undefined {
		try {
			const { resource } = JSON.parse(serializedEditorInput);
			return instantiationService.createInstance(MarkdownPreviewInput, URI.parse(resource));
		} catch {
			return undefined;
		}
	}
}

/**
 * Shows the [Edit | Preview] switcher at the bottom of text editors that have
 * a markdown model.
 */
class MarkdownEditorSwitcherContribution extends Disposable implements IEditorContribution {

	static readonly ID = 'editor.contrib.didaMarkdownSwitcher';

	private widget: IOverlayWidget | undefined;
	private widgetDisposable: IDisposable | undefined;

	constructor(
		private readonly editor: ICodeEditor,
		@IEditorService private readonly editorService: IEditorService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
		this._register(this.editor.onDidChangeModelLanguage(() => this.update()));
		this._register(this.editor.onDidChangeModel(() => this.update()));
		this.update();
	}

	private update(): void {
		const model = this.editor.getModel();
		const isMarkdown = model?.getLanguageId() === 'markdown' && model.uri.scheme !== 'untitled';
		if (isMarkdown && !this.widget) {
			this.widget = this.createWidget();
			this.editor.addOverlayWidget(this.widget);
		} else if (!isMarkdown && this.widget) {
			this.removeWidget();
		}
	}

	private createWidget(): IOverlayWidget {
		const node = createModeSwitcher('edit',
			() => { /* already editing */ },
			() => this.switchToPreview()
		);
		node.style.borderTop = 'none';
		node.style.border = '1px solid var(--vscode-editorGroup-border)';
		node.style.borderRadius = '4px 4px 0 0';
		this.widgetDisposable = { dispose: () => node.remove() };
		return {
			getId: () => MarkdownEditorSwitcherContribution.ID,
			getDomNode: () => node,
			getPosition: (): IOverlayWidgetPosition => ({ preference: OverlayWidgetPositionPreference.BOTTOM_RIGHT_CORNER })
		};
	}

	private removeWidget(): void {
		if (this.widget) {
			this.editor.removeOverlayWidget(this.widget);
			this.widget = undefined;
		}
		this.widgetDisposable?.dispose();
		this.widgetDisposable = undefined;
	}

	private switchToPreview(): void {
		const model = this.editor.getModel();
		const group = this.editorService.activeEditorPane?.group;
		const activeEditor = this.editorService.activeEditor;
		if (!model || !group || !activeEditor || activeEditor.resource?.toString() !== model.uri.toString()) {
			return;
		}
		this.editorService.replaceEditors([{
			editor: activeEditor,
			replacement: this.instantiationService.createInstance(MarkdownPreviewInput, model.uri)
		}], group);
	}

	override dispose(): void {
		this.removeWidget();
		super.dispose();
	}
}

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		MarkdownPreviewEditorPane,
		MarkdownPreviewEditorPane.ID,
		localize('markdownPreview', "Markdown Preview")
	),
	[new SyncDescriptor(MarkdownPreviewInput)]
);

Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(MarkdownPreviewInput.ID, MarkdownPreviewInputSerializer);

registerEditorContribution(MarkdownEditorSwitcherContribution.ID, MarkdownEditorSwitcherContribution, EditorContributionInstantiation.AfterFirstRender);
