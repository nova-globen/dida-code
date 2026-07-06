/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IAhpTerminalCommandSource, IChatTerminalToolProgressPart, ITerminalChatService, ITerminalInstance } from './terminal.js';

/**
 * Terminal chat is not part of this fork, but core terminal UI such as
 * `TerminalTabbedView` still injects ITerminalChatService, hence this null
 * implementation.
 */
export class NullTerminalChatService implements ITerminalChatService {

	declare readonly _serviceBrand: undefined;

	readonly onDidRegisterTerminalInstanceWithToolSession = Event.None;
	readonly onDidContinueInBackground = Event.None;

	registerTerminalInstanceWithToolSession(terminalToolSessionId: string | undefined, instance: ITerminalInstance): void { }

	async getTerminalInstanceByToolSessionId(terminalToolSessionId: string): Promise<ITerminalInstance | undefined> {
		return undefined;
	}

	registerTerminalInstanceWithExecutionId(terminalExecutionId: string, instance: ITerminalInstance): IDisposable {
		return Disposable.None;
	}

	getTerminalInstanceByExecutionId(terminalExecutionId: string): ITerminalInstance | undefined {
		return undefined;
	}

	getToolSessionTerminalInstances(hiddenOnly?: boolean): readonly ITerminalInstance[] {
		return [];
	}

	getToolSessionIdForInstance(instance: ITerminalInstance): string | undefined {
		return undefined;
	}

	registerTerminalInstanceWithChatSession(chatSessionResource: URI, instance: ITerminalInstance): void { }

	getChatSessionResourceForInstance(instance: ITerminalInstance): URI | undefined {
		return undefined;
	}

	isBackgroundTerminal(terminalToolSessionId?: string): boolean {
		return false;
	}

	registerProgressPart(part: IChatTerminalToolProgressPart): IDisposable {
		return Disposable.None;
	}

	setFocusedProgressPart(part: IChatTerminalToolProgressPart): void { }

	clearFocusedProgressPart(part: IChatTerminalToolProgressPart): void { }

	getFocusedProgressPart(): IChatTerminalToolProgressPart | undefined {
		return undefined;
	}

	getMostRecentProgressPart(): IChatTerminalToolProgressPart | undefined {
		return undefined;
	}

	setChatSessionAutoApproval(chatSessionResource: URI, enabled: boolean): void { }

	hasChatSessionAutoApproval(chatSessionResource: URI): boolean {
		return false;
	}

	addSessionAutoApproveRule(chatSessionResource: URI, key: string, value: boolean | { approve: boolean; matchCommandLine?: boolean }): void { }

	getSessionAutoApproveRules(chatSessionResource: URI): Readonly<Record<string, boolean | { approve: boolean; matchCommandLine?: boolean }>> {
		return {};
	}

	continueInBackground(terminalToolSessionId: string): void { }

	registerAhpCommandSource(terminalToolSessionId: string, source: IAhpTerminalCommandSource): IDisposable {
		return Disposable.None;
	}

	getAhpCommandSource(terminalToolSessionId: string): IAhpTerminalCommandSource | undefined {
		return undefined;
	}
}
