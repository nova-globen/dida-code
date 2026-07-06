/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { IChatContextPickerItem, IChatContextPickService, IChatContextValueItem } from './chatContextPickService.js';

/**
 * Chat is not part of this fork, but kept code such as the terminal
 * decoration addon still injects IChatContextPickService, hence this null
 * implementation. Registered items are ignored because there is no chat UI
 * to surface them in.
 */
export class NullChatContextPickService implements IChatContextPickService {

	declare readonly _serviceBrand: undefined;

	readonly items: Iterable<IChatContextValueItem | IChatContextPickerItem> = [];

	registerChatContextItem(item: IChatContextValueItem | IChatContextPickerItem): IDisposable {
		return Disposable.None;
	}
}
