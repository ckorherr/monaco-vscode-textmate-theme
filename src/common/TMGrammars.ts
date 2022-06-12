import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';

interface IEmbeddedLanguagesMap {
	[scopeName: string]: string;
}

interface TokenTypesContribution {
	[scopeName: string]: string;
}

export interface ITMSyntaxExtensionPoint {
	language?: string;
	scopeName: string;
	path: string;
	embeddedLanguages?: IEmbeddedLanguagesMap;
	tokenTypes?: TokenTypesContribution;
	injectTo?: string[];
	balancedBracketScopes?: string[];
	unbalancedBracketScopes?: string[];
}

export interface IExtensionValue<T> {
	extensionLocation: monaco.Uri;
	value: T;
}
