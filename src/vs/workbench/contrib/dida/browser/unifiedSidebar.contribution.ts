/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { IViewContainerModel, IViewDescriptor, IViewDescriptorService, ViewContainer, ViewVisibilityState } from '../../../common/views.js';
import { VIEWLET_ID as EXPLORER_VIEWLET_ID, VIEW_ID as EXPLORER_VIEW_ID } from '../../files/common/files.js';
import { OpenEditorsView } from '../../files/browser/views/openEditorsView.js';
import { VIEW_ID as SEARCH_VIEW_ID } from '../../../services/search/common/search.js';
import { HISTORY_VIEW_PANE_ID, REPOSITORIES_VIEW_PANE_ID, VIEW_PANE_ID as SCM_CHANGES_VIEW_ID } from '../../scm/common/scm.js';

/** Views that Dida gathers into the single Explorer sidebar pane, in order. */
const RELOCATED_VIEW_IDS = [SEARCH_VIEW_ID, REPOSITORIES_VIEW_PANE_ID, SCM_CHANGES_VIEW_ID, HISTORY_VIEW_PANE_ID];

/**
 * Relative default heights for the expandable accordions. Collapsed panes
 * (Open Editors, Repositories) only render their header, so their weight is
 * effectively ignored; the file tree stays dominant (~2/3) with Changes at
 * roughly half of it, the Graph short (about two rows), and Search compact
 * until it has results (see the search view's own auto-height).
 */
const DEFAULT_SIZE_WEIGHTS: Record<string, number> = {
	[OpenEditorsView.ID]: 22,
	[SEARCH_VIEW_ID]: 90,
	[EXPLORER_VIEW_ID]: 640,
	[REPOSITORIES_VIEW_PANE_ID]: 22,
	[SCM_CHANGES_VIEW_ID]: 320,
	[HISTORY_VIEW_PANE_ID]: 70,
};

/**
 * Dida presents a single Explorer sidebar pane: the Search view and the three
 * Source Control views (Repositories, Changes, Graph) are moved out of their
 * own containers and into the Explorer container, so there is only one sidebar
 * tab (which the hidden activity bar then drops entirely). View order,
 * visibility, and collapsed state come from the view descriptors; this
 * contribution performs the relocation and seeds the default pane sizes once.
 */
class UnifiedSidebarContribution implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.didaUnifiedSidebar';

	private static readonly SIZING_APPLIED_KEY = 'dida.unifiedSidebarSizingApplied';

	constructor(
		@IViewDescriptorService private readonly viewDescriptorService: IViewDescriptorService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		const explorer = this.viewDescriptorService.getViewContainerById(EXPLORER_VIEWLET_ID);
		if (!explorer) {
			return;
		}

		this.relocateViews(explorer);
		this.seedDefaultSizesOnce(explorer);
	}

	private relocateViews(explorer: ViewContainer): void {
		// group by current container: moveViewsToContainer derives the source
		// from the first view only, so views from different containers (Search
		// vs Source Control) must be moved in separate calls or they end up
		// added to Explorer without being removed from their origin
		const bySource = new Map<ViewContainer, IViewDescriptor[]>();
		for (const id of RELOCATED_VIEW_IDS) {
			const descriptor = this.viewDescriptorService.getViewDescriptorById(id);
			const current = this.viewDescriptorService.getViewContainerByViewId(id);
			if (!descriptor || !current || current === explorer) {
				continue;
			}
			const group = bySource.get(current) ?? [];
			group.push(descriptor);
			bySource.set(current, group);
		}
		for (const group of bySource.values()) {
			// keep each view's own default visibility (Search visible, the SCM
			// views gated by their `when`); descriptor order does the sorting
			this.viewDescriptorService.moveViewsToContainer(group, explorer, ViewVisibilityState.Default, UnifiedSidebarContribution.ID);
		}
	}

	private seedDefaultSizesOnce(explorer: ViewContainer): void {
		if (this.storageService.getBoolean(UnifiedSidebarContribution.SIZING_APPLIED_KEY, StorageScope.PROFILE, false)) {
			return;
		}
		this.storageService.store(UnifiedSidebarContribution.SIZING_APPLIED_KEY, true, StorageScope.PROFILE, StorageTarget.USER);

		const model: IViewContainerModel = this.viewDescriptorService.getViewContainerModel(explorer);
		const present = new Set(model.allViewDescriptors.map(v => v.id));
		const sizes = Object.entries(DEFAULT_SIZE_WEIGHTS)
			.filter(([id]) => present.has(id))
			.map(([id, size]) => ({ id, size }));
		if (sizes.length) {
			model.setSizes(sizes);
		}
	}
}

registerWorkbenchContribution2(UnifiedSidebarContribution.ID, UnifiedSidebarContribution, WorkbenchPhase.AfterRestored);
