/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';

import { IExtensionManifest } from 'src/app/textMate/support/extensions';

import typescript from 'src/assets/typescript-basics/package.json';
import json from 'src/assets/json/package.json';
import javascript from 'src/assets/javascript/package.json';
import markdown from 'src/assets/markdown-basics/package.json';
import css from 'src/assets/css/package.json';
import html from 'src/assets/html/package.json';

interface IEmbeddedLanguagesMap {
	[scopeName: string]: string;
}

interface TokenTypesContribution {
	[scopeName: string]: string;
}

interface ITMSyntaxExtensionPoint {
	language?: string;
	scopeName: string;
	path: string;
	embeddedLanguages?: IEmbeddedLanguagesMap;
	tokenTypes?: TokenTypesContribution;
	injectTo?: string[];
	balancedBracketScopes?: string[];
	unbalancedBracketScopes?: string[];
}

interface IExtensionValue<T> {
	extensionLocation: monaco.Uri;
	value: T;
}

const EXTENSION_MANIFEST: { location: string; manifest: IExtensionManifest }[] = [
	{ location: '/assets/css', manifest: css as IExtensionManifest },
	{ location: '/assets/html', manifest: html as IExtensionManifest },
	{ location: '/assets/json', manifest: json as IExtensionManifest },
	{ location: '/assets/javascript', manifest: javascript as IExtensionManifest },
	{ location: '/assets/markdown-basics', manifest: markdown as IExtensionManifest },
	{ location: '/assets/typescript-basics', manifest: typescript as IExtensionManifest },
];

export const LANGUAGES: IExtensionValue<ITMSyntaxExtensionPoint[]>[][] = EXTENSION_MANIFEST.reduce((acc, entry) => {
	acc = [
		...acc,
		[
			{
				extensionLocation: monaco.Uri.parse(entry.location),
				value: (entry.manifest.contributes?.grammars || []) as ITMSyntaxExtensionPoint[]
			}
		]
	]
	return acc;
}, [] as IExtensionValue<ITMSyntaxExtensionPoint[]>[][]);

export const LANGUAGE_NAMES = LANGUAGES.reduce((acc, x) => {
	x.forEach(x => x.value.forEach(x => x.language && acc.push(x.language)));
	return acc;
}, [] as string[]);
