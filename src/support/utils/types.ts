/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @returns whether the provided parameter is a JavaScript String or not.
 */
export function isString(str: unknown): str is string {
	return (typeof str === 'string');
}

/**
 * @returns whether the provided parameter is a JavaScript Boolean or not.
 */
export function isBoolean(obj: unknown): obj is boolean {
	return (obj === true || obj === false);
}

/**
 * @returns whether the provided parameter is undefined.
 */
export function isUndefined(obj: unknown): obj is undefined {
	return (typeof obj === 'undefined');
}
