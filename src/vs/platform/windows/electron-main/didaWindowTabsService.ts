/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import electron from 'electron';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { basename } from '../../../base/common/resources.js';
import { isSingleFolderWorkspaceIdentifier, isWorkspaceIdentifier } from '../../workspace/common/workspace.js';
import { ILifecycleMainService } from '../../lifecycle/electron-main/lifecycleMainService.js';
import { ICodeWindow } from '../../window/electron-main/window.js';
import { IWindowsMainService } from './windows.js';

export interface IDidaWindowTab {
	readonly id: number;
	readonly label: string;
	readonly active: boolean;
}

export interface IDidaWindowTabsService {
	readonly onDidChangeTabs: Event<void>;
	getTabs(): Promise<IDidaWindowTab[]>;
	switchToTab(id: number): Promise<void>;
	closeTab(id: number): Promise<void>;
	closeOtherTabs(id: number): Promise<void>;
	moveTab(id: number, toIndex: number): Promise<void>;
	switchToNext(fromId: number, delta: number): Promise<void>;
}

/**
 * Presents all open windows as tabs of a single conceptual window: every
 * window shares the same bounds, exactly one is visible at a time, and a
 * tab strip in the workbench titlebar switches between them. Each tab stays
 * a full, isolated CodeWindow (own renderer, extension host, watcher), so
 * dialogs, focus, and session restore keep working by construction.
 */
export class DidaWindowTabsService extends Disposable implements IDidaWindowTabsService {

	private readonly _onDidChangeTabs = this._register(new Emitter<void>());
	readonly onDidChangeTabs = this._onDidChangeTabs.event;

	/** member window ids in tab order */
	private readonly tabOrder: number[] = [];
	/** most-recently-active first */
	private readonly mruOrder: number[] = [];

	private groupBounds: electron.Rectangle | undefined;
	private groupMaximized = true;
	private switching = false;

	constructor(
		@IWindowsMainService private readonly windowsMainService: IWindowsMainService,
		@ILifecycleMainService private readonly lifecycleMainService: ILifecycleMainService,
	) {
		super();

		for (const window of this.windowsMainService.getWindows()) {
			this.adopt(window);
		}
		this._register(this.windowsMainService.onDidOpenWindow(window => this.adopt(window)));
		this._register(this.windowsMainService.onDidDestroyWindow(window => this.remove(window)));
	}

	private adopt(window: ICodeWindow): void {
		if (this.tabOrder.includes(window.id)) {
			return;
		}

		// opening an already-open folder switches to its tab instead of
		// creating a duplicate
		const duplicateOf = this.findTabWithSameWorkspace(window);
		if (duplicateOf !== undefined) {
			window.win?.close();
			this.doSwitchToTab(duplicateOf);
			return;
		}

		this.tabOrder.push(window.id);

		const win = window.win;
		if (win) {
			// bring the new tab in line with the group geometry, then make it
			// the active tab
			if (this.tabOrder.length > 1) {
				this.captureActiveBounds();
				this.applyGroupBounds(win);
			}
			const listener = () => {
				if (!this.switching && win.isVisible()) {
					this.captureBoundsFrom(win);
				}
			};
			win.on('move', listener);
			win.on('resize', listener);
			win.on('focus', () => this.markActive(window.id));
			// the windows service destroy event does not cover every close
			// path; the BrowserWindow closed event does (remove is idempotent)
			win.once('closed', () => this.remove(window));
		}

		this.markActive(window.id);
		this.hideOthers(window.id);
		this._onDidChangeTabs.fire();
	}

	private remove(window: ICodeWindow): void {
		const index = this.tabOrder.indexOf(window.id);
		if (index === -1) {
			return;
		}
		this.tabOrder.splice(index, 1);
		const mruIndex = this.mruOrder.indexOf(window.id);
		const wasActive = mruIndex === 0;
		if (mruIndex !== -1) {
			this.mruOrder.splice(mruIndex, 1);
		}

		// closing the active tab reveals the most recently used one so the
		// app never appears to vanish while hidden tabs remain — but not
		// while quitting, where windows tear down one by one
		if (wasActive && !this.lifecycleMainService.quitRequested) {
			this.ensureSomeTabVisible();
		}
		this._onDidChangeTabs.fire();
	}

	private findTabWithSameWorkspace(window: ICodeWindow): number | undefined {
		const workspaceId = this.getWorkspaceId(window);
		if (!workspaceId) {
			return undefined;
		}
		return this.tabOrder.find(id => {
			const other = this.windowsMainService.getWindowById(id);
			return other && this.getWorkspaceId(other) === workspaceId;
		});
	}

	private getWorkspaceId(window: ICodeWindow): string | undefined {
		const workspace = window.config?.workspace;
		if (isSingleFolderWorkspaceIdentifier(workspace) || isWorkspaceIdentifier(workspace)) {
			return workspace.id;
		}
		return undefined;
	}

	private markActive(id: number): void {
		const index = this.mruOrder.indexOf(id);
		if (index === 0) {
			return;
		}
		if (index !== -1) {
			this.mruOrder.splice(index, 1);
		}
		this.mruOrder.unshift(id);
		this._onDidChangeTabs.fire();
	}

	/**
	 * Shows the most recently used live tab if no member window is visible —
	 * hidden-only members would otherwise look like the app exited.
	 */
	private ensureSomeTabVisible(): void {
		const liveWindows = this.mruOrder
			.map(id => this.windowsMainService.getWindowById(id))
			.filter(w => w?.win && !w.win.isDestroyed());
		if (liveWindows.length === 0) {
			return;
		}
		if (liveWindows.some(w => w!.win!.isVisible())) {
			return;
		}
		this.doSwitchToTab(liveWindows[0]!.id);
	}

	private captureActiveBounds(): void {
		const active = this.mruOrder.length ? this.windowsMainService.getWindowById(this.mruOrder[0]) : undefined;
		if (active?.win) {
			this.captureBoundsFrom(active.win);
		}
	}

	private captureBoundsFrom(win: electron.BrowserWindow): void {
		this.groupMaximized = win.isMaximized();
		if (!this.groupMaximized) {
			this.groupBounds = win.getBounds();
		}
	}

	private applyGroupBounds(win: electron.BrowserWindow): void {
		if (this.groupMaximized) {
			if (this.groupBounds) {
				win.setBounds(this.groupBounds);
			}
			win.maximize();
		} else if (this.groupBounds) {
			win.unmaximize();
			win.setBounds(this.groupBounds);
		}
	}

	private hideOthers(activeId: number): void {
		this.switching = true;
		try {
			for (const id of this.tabOrder) {
				if (id !== activeId) {
					this.windowsMainService.getWindowById(id)?.win?.hide();
				}
			}
		} finally {
			this.switching = false;
		}
	}

	async getTabs(): Promise<IDidaWindowTab[]> {
		const activeId = this.mruOrder[0];
		return this.tabOrder.map(id => ({
			id,
			label: this.getLabel(id),
			active: id === activeId
		}));
	}

	private getLabel(id: number): string {
		const window = this.windowsMainService.getWindowById(id);
		const workspace = window?.config?.workspace;
		if (isSingleFolderWorkspaceIdentifier(workspace)) {
			return basename(workspace.uri);
		}
		if (isWorkspaceIdentifier(workspace)) {
			return basename(workspace.configPath).replace(/\.code-workspace$/, '');
		}
		return window?.win?.getTitle() ?? `Tab ${id}`;
	}

	async switchToTab(id: number): Promise<void> {
		this.doSwitchToTab(id);
	}

	private doSwitchToTab(id: number): void {
		const target = this.windowsMainService.getWindowById(id);
		const win = target?.win;
		if (!win || win.isDestroyed()) {
			return;
		}
		this.switching = true;
		try {
			this.captureActiveBounds();
			this.applyGroupBounds(win);
			win.show();
			win.focus();
			this.hideOthers(id);
		} finally {
			this.switching = false;
		}
		this.markActive(id);
	}

	async switchToNext(fromId: number, delta: number): Promise<void> {
		if (this.tabOrder.length < 2) {
			return;
		}
		const index = this.tabOrder.indexOf(fromId);
		const next = this.tabOrder[(index + delta + this.tabOrder.length) % this.tabOrder.length];
		this.doSwitchToTab(next);
	}

	async closeTab(id: number): Promise<void> {
		this.windowsMainService.getWindowById(id)?.win?.close();
	}

	async closeOtherTabs(id: number): Promise<void> {
		// snapshot the order first: each close mutates tabOrder through the
		// window's `closed` listener while we iterate
		for (const otherId of [...this.tabOrder]) {
			if (otherId !== id) {
				this.windowsMainService.getWindowById(otherId)?.win?.close();
			}
		}
	}

	async moveTab(id: number, toIndex: number): Promise<void> {
		const from = this.tabOrder.indexOf(id);
		if (from === -1) {
			return;
		}
		this.tabOrder.splice(from, 1);
		const target = Math.max(0, Math.min(toIndex, this.tabOrder.length));
		if (target === from) {
			// unchanged: put it back and skip the redundant re-render
			this.tabOrder.splice(from, 0, id);
			return;
		}
		this.tabOrder.splice(target, 0, id);
		this._onDidChangeTabs.fire();
	}
}
