/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';

import { onUnexpectedError } from '../support/utils/errors';
import { Emitter, Event } from '../support/utils/event';
import { equals as equalArray } from '../support/utils/arrays';
import * as resources from '../support/utils/resources';

import { LanguageId, StandardTokenType, FontStyle, ColorId, MetadataConsts } from '../support/encodedTokenAttributes';
import { LANGUAGES, LANGUAGE_NAMES } from '../common/TMGrammars';
import { ITextMateService } from './textMate';
import type { IGrammar, StackElement, IOnigLib, IRawTheme } from 'vscode-textmate';
import { Disposable, IDisposable, dispose } from '../support/utils/lifecycle';
import { IValidGrammarDefinition, IValidEmbeddedLanguagesMap, IValidTokenTypeMap } from '../common/TMScopeRegistry';
import { missingTMGrammarErrorMessage, TMGrammarFactory } from '../common/TMGrammarFactory';
import { TMTokenization } from '../common/TMTokenization';
import { ColorThemeData } from '../support/colorThemeData';
import { ITextMateThemingRule, IWorkbenchColorTheme } from '../support/workbenchThemeService';


export abstract class AbstractTextMateService extends Disposable implements ITextMateService {
	public _serviceBrand: undefined;

	private readonly _onDidEncounterLanguage: Emitter<string> = this._register(new Emitter<string>());
	public readonly onDidEncounterLanguage: Event<string> = this._onDidEncounterLanguage.event;

	private readonly _encounteredLanguages: boolean[];

	private _grammarDefinitions: IValidGrammarDefinition[] | null;
	private _grammarFactory: TMGrammarFactory | null;
	private _tokenizersRegistrations: IDisposable[];
	protected _currentTheme: IRawTheme | null;
	protected _currentTokenColorMap: string[] | null;

	constructor(
		private readonly _colorTheme: ColorThemeData,
	) {
		super();
		this._encounteredLanguages = [];

		this._grammarDefinitions = null;
		this._grammarFactory = null;
		this._tokenizersRegistrations = [];

		this._currentTheme = null;
		this._currentTokenColorMap = null;

		this._tokenizersRegistrations = dispose(this._tokenizersRegistrations);

		this._grammarDefinitions = [];
		for (const extensions of LANGUAGES) {
			for (const extension of extensions) {
				const grammars = extension.value;
				for (const grammar of grammars) {
					const grammarLocation = resources.joinPath(extension.extensionLocation, grammar.path);

					const embeddedLanguages: IValidEmbeddedLanguagesMap = Object.create(null);
					if (grammar.embeddedLanguages) {
						let scopes = Object.keys(grammar.embeddedLanguages);
						for (let i = 0, len = scopes.length; i < len; i++) {
							let scope = scopes[i];
							let language = grammar.embeddedLanguages[scope];
							if (typeof language !== 'string') {
								// never hurts to be too careful
								continue;
							}
							if (LANGUAGE_NAMES.includes(language)) {
								embeddedLanguages[scope] = monaco.languages.getEncodedLanguageId(language);
							}
						}
					}

					const tokenTypes: IValidTokenTypeMap = Object.create(null);
					if (grammar.tokenTypes) {
						const scopes = Object.keys(grammar.tokenTypes);
						for (const scope of scopes) {
							const tokenType = grammar.tokenTypes[scope];
							switch (tokenType) {
								case 'string':
									tokenTypes[scope] = StandardTokenType.String;
									break;
								case 'other':
									tokenTypes[scope] = StandardTokenType.Other;
									break;
								case 'comment':
									tokenTypes[scope] = StandardTokenType.Comment;
									break;
							}
						}
					}

					let validLanguageId: string | null = null;
					if (grammar.language && LANGUAGE_NAMES.includes(grammar.language)) {
						validLanguageId = grammar.language;
					}

					function asStringArray(array: unknown, defaultValue: string[]): string[] {
						if (!Array.isArray(array)) {
							return defaultValue;
						}
						if (!array.every(e => typeof e === 'string')) {
							return defaultValue;
						}
						return array;
					}

					this._grammarDefinitions.push({
						location: grammarLocation,
						language: validLanguageId ? validLanguageId : undefined,
						scopeName: grammar.scopeName,
						embeddedLanguages: embeddedLanguages,
						tokenTypes: tokenTypes,
						injectTo: grammar.injectTo,
						balancedBracketSelectors: asStringArray(grammar.balancedBracketScopes, ['*']),
						unbalancedBracketSelectors: asStringArray(grammar.unbalancedBracketScopes, []),
					});

					if (validLanguageId) {
						monaco.languages.registerTokensProviderFactory(validLanguageId, this._createFactory(validLanguageId));
					}
				}
			}
		}

		this._updateTheme(this._grammarFactory, this._colorTheme, true);
		// this._register(this._themeService.onDidColorThemeChange(() => {
		// 	this._updateTheme(this._grammarFactory, this._colorTheme, false);
		// }));
	}

	private _canCreateGrammarFactory(): boolean {
		// Check if extension point is ready
		return (this._grammarDefinitions ? true : false);
	}

	private async _getOrCreateGrammarFactory(): Promise<TMGrammarFactory> {
		if (this._grammarFactory) {
			return this._grammarFactory;
		}

		const [vscodeTextmate, vscodeOniguruma] = await Promise.all([import('vscode-textmate'), this._getVSCodeOniguruma()]);
		const onigLib: Promise<IOnigLib> = Promise.resolve({
			createOnigScanner: (sources: string[]) => vscodeOniguruma.createOnigScanner(sources),
			createOnigString: (str: string) => vscodeOniguruma.createOnigString(str)
		});

		// Avoid duplicate instantiations
		if (this._grammarFactory) {
			return this._grammarFactory;
		}

		this._grammarFactory = new TMGrammarFactory({
			logTrace: (msg: string) => console.trace(msg),
			logError: (msg: string, err: any) => console.error(msg, err),
			readFile: (resource: monaco.Uri) => fetch(resource.path).then(r => r.text())
		}, this._grammarDefinitions || [], vscodeTextmate, onigLib);
		this._onDidCreateGrammarFactory(this._grammarDefinitions || []);

		this._updateTheme(this._grammarFactory, this._colorTheme, true);

		return this._grammarFactory;
	}

	private _createFactory(languageId: string): monaco.languages.TokensProviderFactory {
		return {
			create: async (): Promise<monaco.languages.EncodedTokensProvider | null> => {
				if (!LANGUAGE_NAMES.includes(languageId)) {
					return null;
				}
				if (!this._canCreateGrammarFactory()) {
					return null;
				}
				const encodedLanguageId = monaco.languages.getEncodedLanguageId(languageId);

				try {
					const grammarFactory = await this._getOrCreateGrammarFactory();
					if (!grammarFactory.has(languageId)) {
						return null;
					}
					const r = await grammarFactory.createGrammar(languageId, encodedLanguageId);
					if (!r.grammar) {
						return null;
					}
					const tokenization = new TMTokenization(r.grammar, r.initialState, r.containsEmbeddedLanguages);
					tokenization.onDidEncounterLanguage((encodedLanguageId) => {
						if (!this._encounteredLanguages[encodedLanguageId]) {
							const languageId = LANGUAGE_NAMES.find(name => monaco.languages.getEncodedLanguageId(name) === encodedLanguageId)!;
							this._encounteredLanguages[encodedLanguageId] = true;
							this._onDidEncounterLanguage.fire(languageId);
						}
					});
					return new TMTokenizationSupportWithLineLimit(encodedLanguageId, tokenization);
				} catch (err: any) {
					if (err.message && err.message === missingTMGrammarErrorMessage) {
						// Don't log this error message
						return null;
					}
					onUnexpectedError(err);
					return null;
				}
			}
		};
	}

	private _updateTheme(grammarFactory: TMGrammarFactory | null, colorTheme: IWorkbenchColorTheme, forceUpdate: boolean): void {
		if (!forceUpdate && this._currentTheme && this._currentTokenColorMap && AbstractTextMateService.equalsTokenRules(this._currentTheme.settings, colorTheme.tokenColors) && equalArray(this._currentTokenColorMap, colorTheme.tokenColorMap)) {
			return;
		}
		this._currentTheme = { name: colorTheme.label, settings: colorTheme.tokenColors };
		this._currentTokenColorMap = colorTheme.tokenColorMap;
		this._doUpdateTheme(grammarFactory, this._currentTheme, this._currentTokenColorMap);
		monaco.editor.setTheme(colorTheme.baseTheme);
	}

	protected _doUpdateTheme(grammarFactory: TMGrammarFactory | null, theme: IRawTheme, tokenColorMap: string[]): void {
		grammarFactory?.setTheme(theme, tokenColorMap);
		monaco.languages.setColorMap(tokenColorMap)
	}

	private static equalsTokenRules(a: ITextMateThemingRule[] | null, b: ITextMateThemingRule[] | null): boolean {
		if (!b || !a || b.length !== a.length) {
			return false;
		}
		for (let i = b.length - 1; i >= 0; i--) {
			let r1 = b[i];
			let r2 = a[i];
			if (r1.scope !== r2.scope) {
				return false;
			}
			let s1 = r1.settings;
			let s2 = r2.settings;
			if (s1 && s2) {
				if (s1.fontStyle !== s2.fontStyle || s1.foreground !== s2.foreground || s1.background !== s2.background) {
					return false;
				}
			} else if (!s1 || !s2) {
				return false;
			}
		}
		return true;
	}

	public async createGrammar(languageId: string): Promise<IGrammar | null> {
		if (!LANGUAGE_NAMES.includes(languageId)) {
			return null;
		}
		const grammarFactory = await this._getOrCreateGrammarFactory();
		if (!grammarFactory.has(languageId)) {
			return null;
		}
		const encodedLanguageId = monaco.languages.getEncodedLanguageId(languageId);
		const { grammar } = await grammarFactory.createGrammar(languageId, encodedLanguageId);
		return grammar;
	}

	protected _onDidCreateGrammarFactory(grammarDefinitions: IValidGrammarDefinition[]): void {
	}

	protected _onDidDisposeGrammarFactory(): void {
	}

	private _vscodeOniguruma: Promise<typeof import('vscode-oniguruma')> | null = null;
	private _getVSCodeOniguruma(): Promise<typeof import('vscode-oniguruma')> {
		if (!this._vscodeOniguruma) {
			this._vscodeOniguruma = this._doGetVSCodeOniguruma();
		}
		return this._vscodeOniguruma;
	}

	private async _doGetVSCodeOniguruma(): Promise<typeof import('vscode-oniguruma')> {
		const [vscodeOniguruma, wasm] = await Promise.all([import('vscode-oniguruma'), this._loadVSCodeOnigurumWASM()]);
		const options = {
			data: wasm,
			print: (str: string) => {
				console.log(str);
			}
		};
		await vscodeOniguruma.loadWASM(options);
		return vscodeOniguruma;
	}

	protected abstract _loadVSCodeOnigurumWASM(): Promise<Response | ArrayBuffer>;
}

interface IState {
	clone(): IState;
	equals(other: IState): boolean;
}

const NullState: IState = new class implements IState {
	public clone(): IState {
		return this;
	}
	public equals(other: IState): boolean {
		return (this === other);
	}
};

export function nullTokenizeEncoded(languageId: LanguageId, state: StackElement): monaco.languages.IEncodedLineTokens {
	const tokens = new Uint32Array(2);
	tokens[0] = 0;
	tokens[1] = (
		(languageId << MetadataConsts.LANGUAGEID_OFFSET)
		| (StandardTokenType.Other << MetadataConsts.TOKEN_TYPE_OFFSET)
		| (FontStyle.None << MetadataConsts.FONT_STYLE_OFFSET)
		| (ColorId.DefaultForeground << MetadataConsts.FOREGROUND_OFFSET)
		| (ColorId.DefaultBackground << MetadataConsts.BACKGROUND_OFFSET)
	) >>> 0;

	return { tokens, endState: state === null ? NullState : state };
}

class TMTokenizationSupportWithLineLimit implements monaco.languages.EncodedTokensProvider {
	private readonly _encodedLanguageId: LanguageId;
	private readonly _actual: TMTokenization;
	private _maxTokenizationLineLength: number;

	constructor(
		encodedLanguageId: LanguageId,
		actual: TMTokenization,
	) {
		this._encodedLanguageId = encodedLanguageId;
		this._actual = actual;
		this._maxTokenizationLineLength = 2000;
	}

	getInitialState(): monaco.languages.IState {
		return this._actual.getInitialState();
	}

	tokenize(line: string, state: monaco.languages.IState): monaco.languages.ILineTokens {
		throw new Error('Not supported!');
	}

	tokenizeEncoded(line: string, state: StackElement): monaco.languages.IEncodedLineTokens {
		// Do not attempt to tokenize if a line is too long
		if (line.length >= this._maxTokenizationLineLength) {
			return nullTokenizeEncoded(this._encodedLanguageId, state);
		}

		return this._actual.tokenizeEncoded(line, state);
	}
}