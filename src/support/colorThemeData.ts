/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';

import * as Json from './utils/json';
import { Color } from './utils/color';
import { ITextMateThemingRule, IWorkbenchColorTheme, IColorMap, VS_LIGHT_THEME, VS_HC_THEME, ISemanticTokenColorizationSetting, VS_HC_LIGHT_THEME } from './workbenchThemeService';
import * as types from './utils/types';
import * as resources from './utils/resources';
import { ColorIdentifier, editorBackground, editorForeground } from './colorRegistry';
import { TokenStyle, SemanticTokenRule, getTokenClassificationRegistry } from './tokenClassificationRegistry';
import { CharCode } from './utils/charCode';
import { ColorScheme } from './theme';

let tokenClassificationRegistry = getTokenClassificationRegistry();

export class ColorThemeData implements IWorkbenchColorTheme {
	id: string;
	label: string;
	description?: string;
	isLoaded: boolean;
	location: monaco.Uri; // only set for extension from the registry, not for themes restored from the storage
	watch?: boolean;

	private themeTokenColors: ITextMateThemingRule[] = [];
	private customTokenColors: ITextMateThemingRule[] = [];
	private colorMap: IColorMap = {};
	private customColorMap: IColorMap = {};

	private semanticTokenRules: SemanticTokenRule[] = [];
	private customSemanticTokenRules: SemanticTokenRule[] = [];

	private textMateThemingRules: ITextMateThemingRule[] | undefined = undefined; // created on demand
	private tokenColorIndex: TokenColorIndex | undefined = undefined; // created on demand

	private constructor(id: string, label: string, location: monaco.Uri) {
		this.id = id;
		this.label = label;
		this.location = location;
		this.isLoaded = false;
	}

	get tokenColors(): ITextMateThemingRule[] {
		if (!this.textMateThemingRules) {
			const result: ITextMateThemingRule[] = [];

			// the default rule (scope empty) is always the first rule. Ignore all other default rules.
			const foreground = this.getColor(editorForeground);
			const background = this.getColor(editorBackground);
			result.push({
				settings: {
					foreground: normalizeColor(foreground),
					background: normalizeColor(background)
				}
			});

			let hasDefaultTokens = false;

			function addRule(rule: ITextMateThemingRule) {
				if (rule.scope && rule.settings) {
					if (rule.scope === 'token.info-token') {
						hasDefaultTokens = true;
					}
					result.push({ scope: rule.scope, settings: { foreground: normalizeColor(rule.settings.foreground), background: normalizeColor(rule.settings.background), fontStyle: rule.settings.fontStyle } });
				}
			}

			this.themeTokenColors.forEach(addRule);
			// Add the custom colors after the theme colors
			// so that they will override them
			this.customTokenColors.forEach(addRule);

			if (!hasDefaultTokens) {
				defaultThemeColors[this.type].forEach(addRule);
			}
			this.textMateThemingRules = result;
		}
		return this.textMateThemingRules;
	}

	public getColor(colorId: ColorIdentifier, useDefault?: boolean): Color | undefined {
		let color: Color | undefined = this.customColorMap[colorId];
		if (color) {
			return color;
		}
		color = this.colorMap[colorId];
		if (useDefault !== false && types.isUndefined(color)) {
			throw new Error('Not Implemented!')
		}
		return color;
	}

	private getTokenColorIndex(): TokenColorIndex {
		// collect all colors that tokens can have
		if (!this.tokenColorIndex) {
			const index = new TokenColorIndex();
			this.tokenColors.forEach(rule => {
				index.add(rule.settings.foreground);
				index.add(rule.settings.background);
			});

			this.semanticTokenRules.forEach(r => index.add(r.style.foreground));
			tokenClassificationRegistry.getTokenStylingDefaultRules().forEach(r => {
				const defaultColor = r.defaults[this.type];
				if (defaultColor && typeof defaultColor === 'object') {
					index.add(defaultColor.foreground);
				}
			});
			this.customSemanticTokenRules.forEach(r => index.add(r.style.foreground));

			this.tokenColorIndex = index;
		}
		return this.tokenColorIndex;
	}

	public get tokenColorMap(): string[] {
		return this.getTokenColorIndex().asArray();
	}

	public ensureLoaded(): Promise<void> {
		return !this.isLoaded ? this.load() : Promise.resolve(undefined);
	}

	private load(): Promise<void> {
		if (!this.location) {
			return Promise.resolve(undefined);
		}
		this.themeTokenColors = [];
		this.clearCaches();

		const result = {
			colors: {},
			textMateRules: [],
			semanticTokenRules: [],
			semanticHighlighting: false
		};
		return _loadColorTheme(this.location, result).then(_ => {
			this.isLoaded = true;
			this.semanticTokenRules = result.semanticTokenRules;
			this.colorMap = result.colors;
			this.themeTokenColors = result.textMateRules;
		});
	}

	public clearCaches() {
		this.tokenColorIndex = undefined;
		this.textMateThemingRules = undefined;
	}

	get baseTheme(): string {
		return this.classNames[0];
	}

	get classNames(): string[] {
		return this.id.split(' ');
	}

	get type(): ColorScheme {
		switch (this.baseTheme) {
			case VS_LIGHT_THEME: return ColorScheme.LIGHT;
			case VS_HC_THEME: return ColorScheme.HIGH_CONTRAST_DARK;
			case VS_HC_LIGHT_THEME: return ColorScheme.HIGH_CONTRAST_LIGHT;
			default: return ColorScheme.DARK;
		}
	}

	// constructors

	static createUnloadedTheme(id: string, location: monaco.Uri): ColorThemeData {
		let themeData = new ColorThemeData(id, '', location);
		themeData.isLoaded = false;
		themeData.themeTokenColors = [];
		themeData.watch = false;
		return themeData;
	}
}

async function _loadColorTheme(themeLocation: monaco.Uri, result: { textMateRules: ITextMateThemingRule[]; colors: IColorMap; semanticTokenRules: SemanticTokenRule[]; semanticHighlighting: boolean }): Promise<any> {
	const content = await (await fetch(themeLocation.path)).text();
	let errors: Json.ParseError[] = [];
	let contentValue = Json.parse(content, errors);
	if (errors.length > 0) {
		return Promise.reject(new Error("Problems parsing JSON theme file: {0}"));
	} else if (Json.getNodeType(contentValue) !== 'object') {
		return Promise.reject(new Error("Invalid format for JSON theme file: Object expected."));
	}
	if (contentValue.include) {
		await _loadColorTheme(resources.joinPath(resources.dirname(themeLocation), contentValue.include), result);
	}
	result.semanticHighlighting = result.semanticHighlighting || contentValue.semanticHighlighting;
	let colors = contentValue.colors;
	if (colors) {
		if (typeof colors !== 'object') {
			return Promise.reject(new Error("Problem parsing color theme file: {0}. Property 'colors' is not of type 'object'."));
		}
		// new JSON color themes format
		for (let colorId in colors) {
			let colorHex = colors[colorId];
			if (typeof colorHex === 'string') { // ignore colors tht are null
				result.colors[colorId] = Color.fromHex(colors[colorId]);
			}
		}
	}
	let tokenColors = contentValue.tokenColors;
	if (tokenColors) {
		if (Array.isArray(tokenColors)) {
			result.textMateRules.push(...tokenColors);
		} else {
			return Promise.reject(new Error("Problem parsing color theme file: {0}. Property 'tokenColors' should be either an array specifying colors or a path to a TextMate theme file"));
		}
	}
	let semanticTokenColors = contentValue.semanticTokenColors;
	if (semanticTokenColors && typeof semanticTokenColors === 'object') {
		for (let key in semanticTokenColors) {
			try {
				const rule = readSemanticTokenRule(key, semanticTokenColors[key]);
				if (rule) {
					result.semanticTokenRules.push(rule);
				}
			} catch (e) {
				return Promise.reject(new Error("Problem parsing color theme file: {0}. Property 'semanticTokenColors' contains a invalid selector"));
			}
		}
	}
}

let defaultThemeColors: { [baseTheme: string]: ITextMateThemingRule[] } = {
	'light': [
		{ scope: 'token.info-token', settings: { foreground: '#316bcd' } },
		{ scope: 'token.warn-token', settings: { foreground: '#cd9731' } },
		{ scope: 'token.error-token', settings: { foreground: '#cd3131' } },
		{ scope: 'token.debug-token', settings: { foreground: '#800080' } }
	],
	'dark': [
		{ scope: 'token.info-token', settings: { foreground: '#6796e6' } },
		{ scope: 'token.warn-token', settings: { foreground: '#cd9731' } },
		{ scope: 'token.error-token', settings: { foreground: '#f44747' } },
		{ scope: 'token.debug-token', settings: { foreground: '#b267e6' } }
	],
	'hcLight': [
		{ scope: 'token.info-token', settings: { foreground: '#316bcd' } },
		{ scope: 'token.warn-token', settings: { foreground: '#cd9731' } },
		{ scope: 'token.error-token', settings: { foreground: '#cd3131' } },
		{ scope: 'token.debug-token', settings: { foreground: '#800080' } }
	],
	'hcDark': [
		{ scope: 'token.info-token', settings: { foreground: '#6796e6' } },
		{ scope: 'token.warn-token', settings: { foreground: '#008000' } },
		{ scope: 'token.error-token', settings: { foreground: '#FF0000' } },
		{ scope: 'token.debug-token', settings: { foreground: '#b267e6' } }
	]
};

function readSemanticTokenRule(selectorString: string, settings: ISemanticTokenColorizationSetting | string | boolean | undefined): SemanticTokenRule | undefined {
	const selector = tokenClassificationRegistry.parseTokenSelector(selectorString);
	let style: TokenStyle | undefined;
	if (typeof settings === 'string') {
		style = TokenStyle.fromSettings(settings, undefined);
	} else if (isSemanticTokenColorizationSetting(settings)) {
		style = TokenStyle.fromSettings(settings.foreground, settings.fontStyle, settings.bold, settings.underline, settings.strikethrough, settings.italic);
	}
	if (style) {
		return { selector, style };
	}
	return undefined;
}

function isSemanticTokenColorizationSetting(style: any): style is ISemanticTokenColorizationSetting {
	return style && (types.isString(style.foreground) || types.isString(style.fontStyle) || types.isBoolean(style.italic)
		|| types.isBoolean(style.underline) || types.isBoolean(style.strikethrough) || types.isBoolean(style.bold));
}


class TokenColorIndex {

	private _lastColorId: number;
	private _id2color: string[];
	private _color2id: { [color: string]: number };

	constructor() {
		this._lastColorId = 0;
		this._id2color = [];
		this._color2id = Object.create(null);
	}

	public add(color: string | Color | undefined): number {
		color = normalizeColor(color);
		if (color === undefined) {
			return 0;
		}

		let value = this._color2id[color];
		if (value) {
			return value;
		}
		value = ++this._lastColorId;
		this._color2id[color] = value;
		this._id2color[value] = color;
		return value;
	}

	public get(color: string | Color | undefined): number {
		color = normalizeColor(color);
		if (color === undefined) {
			return 0;
		}
		let value = this._color2id[color];
		if (value) {
			return value;
		}
		console.log(`Color ${color} not in index.`);
		return 0;
	}

	public asArray(): string[] {
		return this._id2color.slice(0);
	}

}

function normalizeColor(color: string | Color | undefined | null): string | undefined {
	if (!color) {
		return undefined;
	}
	if (typeof color !== 'string') {
		color = Color.Format.CSS.formatHexA(color, true);
	}
	const len = color.length;
	if (color.charCodeAt(0) !== CharCode.Hash || (len !== 4 && len !== 5 && len !== 7 && len !== 9)) {
		return undefined;
	}
	let result = [CharCode.Hash];

	for (let i = 1; i < len; i++) {
		const upper = hexUpper(color.charCodeAt(i));
		if (!upper) {
			return undefined;
		}
		result.push(upper);
		if (len === 4 || len === 5) {
			result.push(upper);
		}
	}

	if (result.length === 9 && result[7] === CharCode.F && result[8] === CharCode.F) {
		result.length = 7;
	}
	return String.fromCharCode(...result);
}

function hexUpper(charCode: CharCode): number {
	if (charCode >= CharCode.Digit0 && charCode <= CharCode.Digit9 || charCode >= CharCode.A && charCode <= CharCode.F) {
		return charCode;
	} else if (charCode >= CharCode.a && charCode <= CharCode.f) {
		return charCode - CharCode.a + CharCode.A;
	}
	return 0;
}
