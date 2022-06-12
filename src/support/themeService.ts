/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Color } from './utils/color';
import { ColorIdentifier } from './colorRegistry';
import { ColorScheme } from './theme';

export interface IColorTheme {

	readonly type: ColorScheme;

	readonly label: string;

	/**
	 * Resolves the color of the given color identifier. If the theme does not
	 * specify the color, the default color is returned unless <code>useDefault</code> is set to false.
	 * @param color the id of the color
	 * @param useDefault specifies if the default color should be used. If not set, the default is used.
	 */
	getColor(color: ColorIdentifier, useDefault?: boolean): Color | undefined;

	/**
	 * List of all colors used with tokens. <code>getTokenStyleMetadata</code> references the colors by index into this list.
	 */
	readonly tokenColorMap: string[];
}
