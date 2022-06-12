/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export namespace Iterable {

	export function is<T = any>(thing: any): thing is IterableIterator<T> {
		return thing && typeof thing === 'object' && typeof thing[Symbol.iterator] === 'function';
	}

	const _empty: Iterable<any> = Object.freeze([]);
	export function empty<T = any>(): Iterable<T> {
		return _empty;
	}

}
