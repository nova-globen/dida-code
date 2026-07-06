/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { ResourceSet } from '../../../../../base/common/map.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { ISearchComplete, ISearchProgressItem, ITextQuery } from '../../../../services/search/common/search.js';
import { INotebookSearchService } from '../../common/notebookSearch.js';

/**
 * Notebooks are not part of this fork, so notebook search never yields
 * results. The search model still injects INotebookSearchService, hence this
 * null implementation.
 */
class NullNotebookSearchService implements INotebookSearchService {

	declare readonly _serviceBrand: undefined;

	notebookSearch(query: ITextQuery, token: CancellationToken | undefined, searchInstanceID: string, onProgress?: (result: ISearchProgressItem) => void): {
		openFilesToScan: ResourceSet;
		completeData: Promise<ISearchComplete>;
		allScannedFiles: Promise<ResourceSet>;
	} {
		return {
			openFilesToScan: new ResourceSet(),
			completeData: Promise.resolve({ results: [], messages: [] }),
			allScannedFiles: Promise.resolve(new ResourceSet()),
		};
	}
}

export function registerContributions(): void {
	registerSingleton(INotebookSearchService, NullNotebookSearchService, InstantiationType.Delayed);
}
