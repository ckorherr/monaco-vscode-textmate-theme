/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../support/utils/event';
import type { IGrammar } from 'vscode-textmate';

export interface ITextMateService {
	readonly _serviceBrand: undefined;

	onDidEncounterLanguage: Event<string>;

	createGrammar(languageId: string): Promise<IGrammar | null>;
}
