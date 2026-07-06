/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { joinPath } from '../../../../base/common/resources.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { DIDA_FOLDER_CONFIG_FOLDER_NAME, FOLDER_CONFIG_FOLDER_NAME, WORKSPACE_CONFIG_FOLDER_SETTING } from '../../../services/configuration/common/configuration.js';
import { IHostService } from '../../../services/host/browser/host.js';

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'dida',
	title: localize('didaConfigurationTitle', "Dida"),
	type: 'object',
	properties: {
		[WORKSPACE_CONFIG_FOLDER_SETTING]: {
			type: 'string',
			enum: ['auto', 'dida', 'vscode'],
			enumDescriptions: [
				localize('workspaceConfigFolder.auto', "Use `.dida` when the folder contains one, otherwise fall back to `.vscode`."),
				localize('workspaceConfigFolder.dida', "Always use the `.dida` folder."),
				localize('workspaceConfigFolder.vscode', "Always use the `.vscode` folder."),
			],
			default: 'auto',
			scope: ConfigurationScope.APPLICATION,
			description: localize('workspaceConfigFolder', "The folder Dida reads and writes workspace configuration (settings, tasks, launch) from. Takes effect for newly opened folders."),
		}
	}
});

registerAction2(class MigrateWorkspaceConfigToDidaAction extends Action2 {
	constructor() {
		super({
			id: 'dida.migrateWorkspaceConfigToDida',
			title: localize2('migrateWorkspaceConfig', "Migrate .vscode Folder to .dida"),
			category: Categories.File,
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const workspaceService = accessor.get(IWorkspaceContextService);
		const fileService = accessor.get(IFileService);
		const notificationService = accessor.get(INotificationService);
		const hostService = accessor.get(IHostService);

		let migrated = 0;
		for (const folder of workspaceService.getWorkspace().folders) {
			const source = folder.toResource(FOLDER_CONFIG_FOLDER_NAME);
			const target = folder.toResource(DIDA_FOLDER_CONFIG_FOLDER_NAME);
			if (!(await fileService.exists(source))) {
				continue;
			}
			const stat = await fileService.resolve(source);
			for (const child of stat.children ?? []) {
				const targetResource = joinPath(target, child.name);
				if (!(await fileService.exists(targetResource))) {
					await fileService.copy(child.resource, targetResource);
				}
			}
			migrated++;
		}

		if (migrated === 0) {
			notificationService.info(localize('nothingToMigrate', "No .vscode folder found in the current workspace."));
			return;
		}

		notificationService.prompt(
			Severity.Info,
			localize('migrationDone', "Copied .vscode configuration to .dida in {0} folder(s). The original .vscode folder was left untouched. Reload to apply.", migrated),
			[{ label: localize('reload', "Reload Window"), run: () => hostService.reload() }]
		);
	}
});
