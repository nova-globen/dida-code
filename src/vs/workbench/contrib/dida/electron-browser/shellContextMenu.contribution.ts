/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isWindows } from '../../../../base/common/platform.js';
import { localize } from '../../../../nls.js';
import { INotificationService, NeverShowAgainScope, Severity } from '../../../../platform/notification/common/notification.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';

/**
 * Asks once on startup whether to add an "Open with Dida" entry to the
 * Windows Explorer context menu and whether to add the CLI to the user PATH.
 */
class ShellIntegrationPromptContribution implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.didaShellIntegrationPrompt';

	private static readonly CONTEXT_MENU_PROMPTED_KEY = 'dida.shellContextMenuPrompted';
	private static readonly PATH_PROMPTED_KEY = 'dida.pathPrompted';

	constructor(
		@INotificationService private readonly notificationService: INotificationService,
		@IStorageService private readonly storageService: IStorageService,
		@INativeHostService private readonly nativeHostService: INativeHostService,
		@IProductService private readonly productService: IProductService,
	) {
		if (!isWindows) {
			return;
		}
		this.promptContextMenu();
		this.promptPath();
	}

	private prompted(key: string): boolean {
		if (this.storageService.getBoolean(key, StorageScope.APPLICATION, false)) {
			return true;
		}
		this.storageService.store(key, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
		return false;
	}

	private promptContextMenu(): void {
		if (this.prompted(ShellIntegrationPromptContribution.CONTEXT_MENU_PROMPTED_KEY)) {
			return;
		}
		this.notificationService.prompt(
			Severity.Info,
			localize('shellContextMenuPrompt', "Add \"Open with {0}\" to the Windows Explorer context menu for files and folders?", this.productService.nameLong),
			[{
				label: localize('shellContextMenuAdd', "Add"),
				run: async () => {
					try {
						await this.nativeHostService.installShellContextMenu();
						this.notificationService.info(localize('shellContextMenuAdded', "\"Open with {0}\" was added to the Explorer context menu.", this.productService.nameLong));
					} catch (error) {
						this.notificationService.error(localize('shellContextMenuFailed', "Adding the Explorer context menu entry failed: {0}", String(error)));
					}
				}
			}, {
				label: localize('promptNever', "Don't Ask Again"),
				run: () => { }
			}],
			{ neverShowAgain: { id: ShellIntegrationPromptContribution.CONTEXT_MENU_PROMPTED_KEY, scope: NeverShowAgainScope.APPLICATION } }
		);
	}

	private promptPath(): void {
		if (this.prompted(ShellIntegrationPromptContribution.PATH_PROMPTED_KEY)) {
			return;
		}
		this.notificationService.prompt(
			Severity.Info,
			localize('pathPrompt', "Add the '{0}' command to your PATH so you can launch {1} from any terminal?", this.productService.applicationName, this.productService.nameLong),
			[{
				label: localize('pathAdd', "Add to PATH"),
				run: async () => {
					try {
						await this.nativeHostService.addToPath();
						this.notificationService.info(localize('pathAdded', "'{0}' was added to your PATH. New terminals will pick it up.", this.productService.applicationName));
					} catch (error) {
						this.notificationService.error(localize('pathFailed', "Adding to PATH failed: {0}", String(error)));
					}
				}
			}, {
				label: localize('promptNever', "Don't Ask Again"),
				run: () => { }
			}],
			{ neverShowAgain: { id: ShellIntegrationPromptContribution.PATH_PROMPTED_KEY, scope: NeverShowAgainScope.APPLICATION } }
		);
	}
}

registerWorkbenchContribution2(ShellIntegrationPromptContribution.ID, ShellIntegrationPromptContribution, WorkbenchPhase.Eventually);
