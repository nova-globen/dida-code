/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IConfigurationNode } from '../../../platform/configuration/common/configurationRegistry.js';
import { TerminalAccessibilityCommandId, defaultTerminalAccessibilityCommandsToSkipShell } from '../terminalContrib/accessibility/common/terminal.accessibility.js';
import { terminalAccessibilityConfiguration } from '../terminalContrib/accessibility/common/terminalAccessibilityConfiguration.js';
import { terminalAutoRepliesConfiguration } from '../terminalContrib/autoReplies/common/terminalAutoRepliesConfiguration.js';
import { terminalCommandGuideConfiguration } from '../terminalContrib/commandGuide/common/terminalCommandGuideConfiguration.js';
import { TerminalDeveloperCommandId } from '../terminalContrib/developer/common/terminal.developer.js';
import { defaultTerminalFindCommandToSkipShell } from '../terminalContrib/find/common/terminal.find.js';
import { defaultTerminalHistoryCommandsToSkipShell, terminalHistoryConfiguration } from '../terminalContrib/history/common/terminal.history.js';
import { terminalOscNotificationsConfiguration } from '../terminalContrib/notification/common/terminalNotificationConfiguration.js';
import { TerminalStickyScrollSettingId, terminalStickyScrollConfiguration } from '../terminalContrib/stickyScroll/common/terminalStickyScrollConfiguration.js';
import { defaultTerminalSuggestCommandsToSkipShell } from '../terminalContrib/suggest/common/terminal.suggest.js';
import { TerminalSuggestSettingId, terminalSuggestConfiguration } from '../terminalContrib/suggest/common/terminalSuggestConfiguration.js';
import { terminalTypeAheadConfiguration } from '../terminalContrib/typeAhead/common/terminalTypeAheadConfiguration.js';
import { terminalZoomConfiguration } from '../terminalContrib/zoom/common/terminal.zoom.js';

// HACK: Export some commands from `terminalContrib/` that are depended upon elsewhere. These are
// soft layer breakers between `terminal/` and `terminalContrib/` but there are difficulties in
// removing the dependency. These are explicitly defined here to avoid an eslint line override.
export const enum TerminalContribCommandId {
	A11yFocusAccessibleBuffer = TerminalAccessibilityCommandId.FocusAccessibleBuffer,
	DeveloperRestartPtyHost = TerminalDeveloperCommandId.RestartPtyHost,
	OpenTerminalSettingsLink = 'workbench.action.terminal.chat.openTerminalSettingsLink',
	DisableSessionAutoApproval = 'workbench.action.terminal.chat.disableSessionAutoApproval',
	FocusMostRecentChatTerminalOutput = 'workbench.action.terminal.chat.focusMostRecentChatTerminalOutput',
	FocusMostRecentChatTerminal = 'workbench.action.terminal.chat.focusMostRecentChatTerminal',
	ToggleChatTerminalOutput = 'workbench.action.terminal.chat.toggleChatTerminalOutput',
	FocusChatInstanceAction = 'workbench.action.terminal.chat.focusChatInstance',
	ContinueInBackground = 'workbench.action.terminal.chat.continueInBackground',
}

// HACK: Export some settings from `terminalContrib/` that are depended upon elsewhere. These are
// soft layer breakers between `terminal/` and `terminalContrib/` but there are difficulties in
// removing the dependency. These are explicitly defined here to avoid an eslint line override.
export const enum TerminalContribSettingId {
	StickyScrollEnabled = TerminalStickyScrollSettingId.Enabled,
	SuggestEnabled = TerminalSuggestSettingId.Enabled,
	AutoApprove = 'chat.tools.terminal.autoApprove',
	EnableAutoApprove = 'chat.tools.terminal.enableAutoApprove',
	ShellIntegrationTimeout = 'chat.tools.terminal.shellIntegrationTimeout',
	OutputLocation = 'chat.tools.terminal.outputLocation',
	AgentSandboxEnabled = 'chat.agent.sandbox.enabled',
	AgentSandboxWindowsEnabled = 'chat.agent.sandbox.enabledWindows',
	AgentSandboxAllowNetwork = 'chat.agent.sandbox.allowNetwork',
	AgentSandboxAllowUnsandboxedCommands = 'chat.agent.sandbox.allowUnsandboxedCommands',
	AgentSandboxRetryWithAllowNetworkRequests = 'chat.agent.sandbox.retryWithAllowNetworkRequests',
	AgentSandboxAllowAutoApprove = 'chat.agent.sandbox.allowAutoApprove',
	DeprecatedAgentSandboxEnabled = 'chat.agent.sandbox',
	DeprecatedAgentSandboxLinuxFileSystem = 'chat.agent.sandboxFileSystem.linux',
	DeprecatedAgentSandboxMacFileSystem = 'chat.agent.sandboxFileSystem.mac',
	AgentSandboxLinuxFileSystem = 'chat.agent.sandbox.fileSystem.linux',
	AgentSandboxMacFileSystem = 'chat.agent.sandbox.fileSystem.mac',
	AgentSandboxWindowsFileSystem = 'chat.agent.sandbox.fileSystem.windows',
}

// HACK: Export some context key strings from `terminalContrib/` that are depended upon elsewhere.
// These are soft layer breakers between `terminal/` and `terminalContrib/` but there are
// difficulties in removing the dependency. These are explicitly defined here to avoid an eslint
// line override.
export const enum TerminalContribContextKeyStrings {
	ChatHasTerminals = 'hasChatTerminals',
	ChatHasHiddenTerminals = 'hasHiddenChatTerminals',
}

// Export configuration schemes from terminalContrib - this is an exception to the eslint rule since
// they need to be declared at part of the rest of the terminal configuration
export const terminalContribConfiguration: IConfigurationNode['properties'] = {
	...terminalAccessibilityConfiguration,
	...terminalAutoRepliesConfiguration,
	...terminalCommandGuideConfiguration,
	...terminalHistoryConfiguration,
	...terminalOscNotificationsConfiguration,
	...terminalStickyScrollConfiguration,
	...terminalSuggestConfiguration,
	...terminalTypeAheadConfiguration,
	...terminalZoomConfiguration,
};

// Export commands to skip shell from terminalContrib - this is an exception to the eslint rule
// since they need to be included in the terminal module
export const defaultTerminalContribCommandsToSkipShell = [
	...defaultTerminalAccessibilityCommandsToSkipShell,
	...defaultTerminalFindCommandToSkipShell,
	...defaultTerminalHistoryCommandsToSkipShell,
	...defaultTerminalSuggestCommandsToSkipShell,
];
