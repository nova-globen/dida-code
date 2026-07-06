/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { arch } from '../../../../base/common/process.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
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

/**
 * Lightweight manual update check: fetches the release manifest from
 * code.didabit.com at most once a day and offers a download link when a
 * newer version is published. No auto-download, no installer execution.
 */
class UpdateCheckContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.didaUpdateCheck';

	constructor(
		@IProductService private readonly productService: IProductService,
		@IRequestService private readonly requestService: IRequestService,
		@INotificationService private readonly notificationService: INotificationService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();
		this.checkForUpdates();
	}

	private async checkForUpdates(): Promise<void> {
		const manifestUrl = this.productService.didaUpdateManifestUrl;
		if (!manifestUrl) {
			return;
		}

		const lastCheck = this.storageService.getNumber(LAST_CHECK_KEY, StorageScope.APPLICATION, 0);
		if (Date.now() - lastCheck < CHECK_INTERVAL) {
			return;
		}

		let release: IDidaRelease | null;
		try {
			const context = await this.requestService.request({ type: 'GET', url: manifestUrl, callSite: 'didaUpdateCheck' }, CancellationToken.None);
			const json = await asJson<IDidaRelease | IDidaRelease[]>(context);
			release = Array.isArray(json) ? json[0] : json;
		} catch {
			// offline or endpoint not live yet — try again next interval
			return;
		}
		this.storageService.store(LAST_CHECK_KEY, Date.now(), StorageScope.APPLICATION, StorageTarget.MACHINE);
		if (!release) {
			return;
		}

		const platformKey = `win32-${arch}`;
		const platformEntry = release.platforms?.[platformKey];
		const latestVersion = platformEntry?.version ?? release.version;
		const downloadUrl = platformEntry?.url ?? release.url ?? this.productService.downloadUrl;
		if (!latestVersion || !downloadUrl) {
			return;
		}

		if (!this.isNewer(latestVersion, this.productService.version)) {
			return;
		}
		if (this.storageService.get(DISMISSED_KEY, StorageScope.APPLICATION) === latestVersion) {
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

registerWorkbenchContribution2(UpdateCheckContribution.ID, UpdateCheckContribution, WorkbenchPhase.Eventually);
