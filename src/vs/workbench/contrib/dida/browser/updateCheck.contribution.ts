/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { arch } from '../../../../base/common/process.js';
import { URI } from '../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { asJson, IRequestService } from '../../../../platform/request/common/request.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';

interface IDidaRelease {
	readonly version?: string;
	readonly url?: string;
	readonly notes?: string;
	readonly platforms?: Record<string, { url?: string; version?: string }>;
}

const LAST_CHECK_KEY = 'dida.update.lastCheck';
const DISMISSED_KEY = 'dida.update.dismissedVersion';
const CHECK_INTERVAL = 24 * 60 * 60 * 1000;

interface ICheckOptions {
	/** Ignore the once-a-day throttle (used by the manual Help menu check). */
	readonly force?: boolean;
	/** Report "up to date" / errors to the user (manual check only). */
	readonly interactive?: boolean;
}

export const IDidaUpdateService = createDecorator<IDidaUpdateService>('didaUpdateService');

export interface IDidaUpdateService {
	readonly _serviceBrand: undefined;
	checkForUpdates(options?: ICheckOptions): Promise<void>;
}

/**
 * Lightweight update check: fetches the release manifest from
 * code.didabit.com and offers a download link when a newer version is
 * published. No auto-download, no installer execution. The automatic check
 * runs at most once a day; the Help > Check for Updates command forces it and
 * reports the result either way.
 */
class DidaUpdateService extends Disposable implements IDidaUpdateService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@IProductService private readonly productService: IProductService,
		@IRequestService private readonly requestService: IRequestService,
		@INotificationService private readonly notificationService: INotificationService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();
	}

	async checkForUpdates(options: ICheckOptions = {}): Promise<void> {
		const { force, interactive } = options;

		const manifestUrl = this.productService.didaUpdateManifestUrl;
		if (!manifestUrl) {
			if (interactive) {
				this.notificationService.info(localize('updateNotConfigured', "Update checks are not available in this build."));
			}
			return;
		}

		if (!force) {
			const lastCheck = this.storageService.getNumber(LAST_CHECK_KEY, StorageScope.APPLICATION, 0);
			if (Date.now() - lastCheck < CHECK_INTERVAL) {
				return;
			}
		}

		let release: IDidaRelease | null;
		try {
			const context = await this.requestService.request({ type: 'GET', url: manifestUrl, callSite: 'didaUpdateCheck' }, CancellationToken.None);
			const json = await asJson<IDidaRelease | IDidaRelease[]>(context);
			release = Array.isArray(json) ? json[0] : json;
		} catch {
			// offline or endpoint not live yet — try again next interval
			if (interactive) {
				this.notificationService.warn(localize('updateCheckFailed', "Could not check for updates. Check your connection and try again."));
			}
			return;
		}
		this.storageService.store(LAST_CHECK_KEY, Date.now(), StorageScope.APPLICATION, StorageTarget.MACHINE);

		const platformKey = `win32-${arch}`;
		const platformEntry = release?.platforms?.[platformKey];
		const latestVersion = platformEntry?.version ?? release?.version;
		const downloadUrl = platformEntry?.url ?? release?.url ?? this.productService.downloadUrl;

		if (!latestVersion || !downloadUrl || !this.isNewer(latestVersion, this.productService.version)) {
			if (interactive) {
				this.notificationService.info(localize('updateUpToDate', "Dida {0} is up to date.", this.productService.version));
			}
			return;
		}

		// a prior "Skip This Version" only suppresses the automatic prompt; an
		// explicit manual check always surfaces the available update
		if (!interactive && this.storageService.get(DISMISSED_KEY, StorageScope.APPLICATION) === latestVersion) {
			return;
		}

		this.notificationService.prompt(
			Severity.Info,
			localize('updateAvailable', "Dida {0} is available (you have {1}).", latestVersion, this.productService.version),
			[
				{
					label: localize('download', "Download"),
					run: () => this.openerService.open(URI.parse(downloadUrl))
				},
				{
					label: localize('skipVersion', "Skip This Version"),
					run: () => this.storageService.store(DISMISSED_KEY, latestVersion, StorageScope.APPLICATION, StorageTarget.MACHINE)
				}
			]
		);
	}

	private isNewer(latest: string, current: string): boolean {
		const parse = (v: string) => v.replace(/^v/, '').split(/[.-]/).map(part => parseInt(part, 10) || 0);
		const a = parse(latest);
		const b = parse(current);
		for (let i = 0; i < Math.max(a.length, b.length); i++) {
			const diff = (a[i] ?? 0) - (b[i] ?? 0);
			if (diff !== 0) {
				return diff > 0;
			}
		}
		return false;
	}
}

registerSingleton(IDidaUpdateService, DidaUpdateService, InstantiationType.Delayed);

/** Fires the throttled automatic check shortly after startup. */
class UpdateCheckContribution implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.didaUpdateCheck';

	constructor(@IDidaUpdateService updateService: IDidaUpdateService) {
		updateService.checkForUpdates();
	}
}

registerWorkbenchContribution2(UpdateCheckContribution.ID, UpdateCheckContribution, WorkbenchPhase.Eventually);

registerAction2(class CheckForUpdatesAction extends Action2 {
	constructor() {
		super({
			id: 'dida.update.checkForUpdates',
			title: localize2('checkForUpdates', "Check for Updates..."),
			category: localize2('dida', "Dida"),
			f1: true,
			menu: {
				id: MenuId.MenubarHelpMenu,
				group: '1_welcome',
				order: 6
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		await accessor.get(IDidaUpdateService).checkForUpdates({ force: true, interactive: true });
	}
});
