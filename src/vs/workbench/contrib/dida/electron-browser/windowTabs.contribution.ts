/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';

interface IDidaWindowTab {
	readonly id: number;
	readonly label: string;
	readonly active: boolean;
}

interface IDidaWindowTabsService {
	readonly onDidChangeTabs: Event<void>;
	getTabs(): Promise<IDidaWindowTab[]>;
	switchToTab(id: number): Promise<void>;
	closeTab(id: number): Promise<void>;
	switchToNext(fromId: number, delta: number): Promise<void>;
}

function getWindowTabsService(accessor: ServicesAccessor): IDidaWindowTabsService {
	return ProxyChannel.toService<IDidaWindowTabsService>(accessor.get(IMainProcessService).getChannel('didaWindowTabs'));
}

/**
 * Renders the window tabs (one per open window, managed by the main-process
 * DidaWindowTabsService) as a strip in the titlebar. Hidden while only one
 * window is open.
 */
class WindowTabsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.didaWindowTabs';

	private readonly tabsService: IDidaWindowTabsService;
	private container: HTMLElement | undefined;
	private readonly renderDisposables = this._register(new DisposableStore());

	constructor(
		@IMainProcessService mainProcessService: IMainProcessService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@INativeHostService private readonly nativeHostService: INativeHostService,
	) {
		super();
		this.tabsService = ProxyChannel.toService<IDidaWindowTabsService>(mainProcessService.getChannel('didaWindowTabs'));

		this._register(this.tabsService.onDidChangeTabs(() => this.render()));
		this.render();
	}

	private ensureContainer(): HTMLElement | undefined {
		if (this.container?.isConnected) {
			return this.container;
		}
		const titlebar = this.layoutService.getContainer(dom.getActiveWindow(), Parts.TITLEBAR_PART);
		// eslint-disable-next-line no-restricted-syntax
		const left = titlebar?.querySelector<HTMLElement>('.titlebar-left');
		if (!left) {
			return undefined;
		}
		this.container = dom.append(left, dom.$('.dida-window-tabs'));
		this.container.style.display = 'flex';
		this.container.style.alignItems = 'center';
		this.container.style.gap = '2px';
		this.container.style.margin = '0 4px';
		this.container.style.maxWidth = '45vw';
		this.container.style.overflow = 'hidden';
		// the titlebar is a window drag region; without an explicit no-drag
		// the OS turns clicks into window drags and no DOM event ever fires
		this.container.style.setProperty('-webkit-app-region', 'no-drag');
		return this.container;
	}

	private async render(): Promise<void> {
		const container = this.ensureContainer();
		if (!container) {
			return;
		}
		const tabs = await this.tabsService.getTabs();
		this.renderDisposables.clear();
		dom.clearNode(container);
		if (tabs.length < 2) {
			return;
		}

		for (const tab of tabs) {
			const el = dom.append(container, dom.$('.dida-window-tab'));
			el.style.display = 'flex';
			el.style.alignItems = 'center';
			el.style.gap = '4px';
			el.style.padding = '2px 6px 2px 10px';
			el.style.borderRadius = '5px';
			el.style.cursor = 'pointer';
			el.style.whiteSpace = 'nowrap';
			el.style.overflow = 'hidden';
			el.style.font = 'inherit';
			el.style.background = tab.active ? 'var(--vscode-tab-activeBackground, var(--vscode-toolbar-activeBackground))' : 'transparent';
			el.style.color = 'var(--vscode-titleBar-activeForeground)';
			el.style.setProperty('-webkit-app-region', 'no-drag');
			el.style.outline = tab.active ? '1px solid var(--vscode-contrastActiveBorder, transparent)' : 'none';
			el.title = tab.label;

			const label = dom.append(el, dom.$('span'));
			label.textContent = tab.label;
			label.style.textOverflow = 'ellipsis';
			label.style.overflow = 'hidden';
			label.style.maxWidth = '160px';

			const close = dom.append(el, dom.$('span.codicon.codicon-close'));
			close.style.fontSize = '12px';
			close.style.opacity = '0.7';

			this.renderDisposables.add(dom.addDisposableListener(el, 'click', e => {
				if (e.target === close) {
					this.tabsService.closeTab(tab.id);
				} else if (!tab.active) {
					this.tabsService.switchToTab(tab.id);
				}
			}));
			this.renderDisposables.add(dom.addDisposableListener(el, 'auxclick', e => {
				if (e.button === 1) {
					this.tabsService.closeTab(tab.id);
				}
			}));
		}

		const add = dom.append(container, dom.$('.dida-window-tab-add.codicon.codicon-add'));
		add.style.padding = '3px';
		add.style.cursor = 'pointer';
		add.style.opacity = '0.8';
		add.style.setProperty('-webkit-app-region', 'no-drag');
		add.title = localize('newFolderTab', "Open Folder in New Tab");
		this.renderDisposables.add(dom.addDisposableListener(add, 'click', () => {
			this.nativeHostService.pickFolderAndOpen({ forceNewWindow: true });
		}));
	}
}

registerAction2(class OpenFolderInNewTabAction extends Action2 {
	constructor() {
		super({
			id: 'dida.windowTabs.openFolder',
			title: localize2('openFolderInNewTab', "Open Folder in New Tab..."),
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		await accessor.get(INativeHostService).pickFolderAndOpen({ forceNewWindow: true });
	}
});

registerAction2(class NextWindowTabAction extends Action2 {
	constructor() {
		super({
			id: 'dida.windowTabs.next',
			title: localize2('nextWindowTab', "Switch to Next Tab"),
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.PageDown,
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const windowId = accessor.get(INativeHostService).windowId;
		await getWindowTabsService(accessor).switchToNext(windowId, 1);
	}
});

registerAction2(class PreviousWindowTabAction extends Action2 {
	constructor() {
		super({
			id: 'dida.windowTabs.previous',
			title: localize2('previousWindowTab', "Switch to Previous Tab"),
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.PageUp,
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const windowId = accessor.get(INativeHostService).windowId;
		await getWindowTabsService(accessor).switchToNext(windowId, -1);
	}
});

registerWorkbenchContribution2(WindowTabsContribution.ID, WindowTabsContribution, WorkbenchPhase.AfterRestored);
