/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Color } from './utils/color';
import { IColorTheme } from './themeService';

export const VS_LIGHT_THEME = 'vs';
export const VS_DARK_THEME = 'vs-dark';
export const VS_HC_THEME = 'hc-black';
export const VS_HC_LIGHT_THEME = 'hc-light';

interface IWorkbenchTheme {
	readonly id: string;
	readonly label: string;
	readonly description?: string;
}

export interface IWorkbenchColorTheme extends IWorkbenchTheme, IColorTheme {
	readonly tokenColors: ITextMateThemingRule[];
	get baseTheme(): string;
}

export interface IColorMap {
	[id: string]: Color;
}

export interface ITextMateThemingRule {
	name?: string;
	scope?: string | string[];
	settings: ITokenColorizationSetting;
}

interface ITokenColorizationSetting {
	foreground?: string;
	background?: string;
	fontStyle?: string; /* [italic|bold|underline|strikethrough] */
}

export interface ISemanticTokenColorizationSetting {
	foreground?: string;
	fontStyle?: string; /* [italic|bold|underline|strikethrough] */
	bold?: boolean;
	underline?: boolean;
	strikethrough?: boolean;
	italic?: boolean;
}
