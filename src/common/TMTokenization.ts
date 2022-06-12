/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';

import { Emitter, Event } from '../support/utils/event';
import { LanguageId, TokenMetadata } from '../support/encodedTokenAttributes';
import type { IGrammar, StackElement } from 'vscode-textmate';
import { Disposable } from '../support/utils/lifecycle';

export class TMTokenization extends Disposable implements monaco.languages.EncodedTokensProvider {

	private readonly _grammar: IGrammar;
	private readonly _containsEmbeddedLanguages: boolean;
	private readonly _seenLanguages: boolean[];
	private readonly _initialState: StackElement;

	private readonly _onDidEncounterLanguage: Emitter<LanguageId> = this._register(new Emitter<LanguageId>());
	public readonly onDidEncounterLanguage: Event<LanguageId> = this._onDidEncounterLanguage.event;

	constructor(grammar: IGrammar, initialState: StackElement, containsEmbeddedLanguages: boolean) {
		super();
		this._grammar = grammar;
		this._initialState = initialState;
		this._containsEmbeddedLanguages = containsEmbeddedLanguages;
		this._seenLanguages = [];
	}

	public getInitialState(): monaco.languages.IState {
		return this._initialState;
	}

	public tokenize(line: string, state: monaco.languages.IState): monaco.languages.ILineTokens {
		throw new Error('Not supported!');
	}

	public tokenizeEncoded(line: string, state: StackElement): monaco.languages.IEncodedLineTokens {
		const textMateResult = this._grammar.tokenizeLine2(line, state, 500);

		if (textMateResult.stoppedEarly) {
			console.warn(`Time limit reached when tokenizing line: ${line.substring(0, 100)}`);
			// return the state at the beginning of the line
			return { tokens: textMateResult.tokens, endState: state };
		}

		if (this._containsEmbeddedLanguages) {
			let seenLanguages = this._seenLanguages;
			let tokens = textMateResult.tokens;

			// Must check if any of the embedded languages was hit
			for (let i = 0, len = (tokens.length >>> 1); i < len; i++) {
				let metadata = tokens[(i << 1) + 1];
				let languageId = TokenMetadata.getLanguageId(metadata);

				if (!seenLanguages[languageId]) {
					seenLanguages[languageId] = true;
					this._onDidEncounterLanguage.fire(languageId);
				}
			}
		}

		let endState: StackElement;
		// try to save an object if possible
		if (state.equals(textMateResult.ruleStack)) {
			endState = state;
		} else {
			endState = textMateResult.ruleStack;

		}

		return { tokens: textMateResult.tokens, endState };
	}
}
