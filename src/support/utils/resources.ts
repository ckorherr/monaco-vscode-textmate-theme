/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';

import { CharCode } from './charCode';
import * as paths from './path';

//#region IExtUri

interface IExtUri {

	// --- identity

	/**
	 * Tests whether two uris are equal
	 *
	 * @param uri1 Uri
	 * @param uri2 Uri
	 * @param ignoreFragment Ignore the fragment (defaults to `false`)
	 */
	isEqual(uri1: monaco.Uri | undefined, uri2: monaco.Uri | undefined, ignoreFragment?: boolean): boolean;

	/**
	 * Creates a key from a resource URI to be used to resource comparison and for resource maps.
	 * @see {@link ResourceMap}
	 * @param uri Uri
	 * @param ignoreFragment Ignore the fragment (defaults to `false`)
	 */
	getComparisonKey(uri: monaco.Uri, ignoreFragment?: boolean): string;

	// --- path math

	/**
	 * Return a URI representing the directory of a URI path.
	 *
	 * @param resource The input URI.
	 * @returns The URI representing the directory of the input URI.
	 */
	dirname(resource: monaco.Uri): monaco.Uri;
	/**
	 * Join a URI path with path fragments and normalizes the resulting path.
	 *
	 * @param resource The input URI.
	 * @param pathFragment The path fragment to add to the URI path.
	 * @returns The resulting URI.
	 */
	joinPath(resource: monaco.Uri, ...pathFragment: string[]): monaco.Uri;
}

class ExtUri implements IExtUri {

	constructor(private _ignorePathCasing: (uri: monaco.Uri) => boolean) { }
	isEqual(uri1: monaco.Uri | undefined, uri2: monaco.Uri | undefined, ignoreFragment: boolean = false): boolean {
		if (uri1 === uri2) {
			return true;
		}
		if (!uri1 || !uri2) {
			return false;
		}
		return this.getComparisonKey(uri1, ignoreFragment) === this.getComparisonKey(uri2, ignoreFragment);
	}

	getComparisonKey(uri: monaco.Uri, ignoreFragment: boolean = false): string {
		return uri.with({
			path: this._ignorePathCasing(uri) ? uri.path.toLowerCase() : undefined,
			fragment: ignoreFragment ? null : undefined
		}).toString();
	}

	// --- path math

	joinPath(resource: monaco.Uri, ...pathFragment: string[]): monaco.Uri {
		return monaco.Uri.joinPath(resource, ...pathFragment);
	}

	dirname(resource: monaco.Uri): monaco.Uri {
		if (resource.path.length === 0) {
			return resource;
		}
		let dirname = paths.posix.dirname(resource.path);
		if (resource.authority && dirname.length && dirname.charCodeAt(0) !== CharCode.Slash) {
			console.error(`dirname("${resource.toString})) resulted in a relative path`);
			dirname = '/'; // If a URI contains an authority component, then the path component must either be empty or begin with a CharCode.Slash ("/") character
		}
		return resource.with({
			path: dirname
		});
	}
}


/**
 * Unbiased utility that takes uris "as they are". This means it can be interchanged with
 * uri#toString() usages. The following is true
 * ```
 * assertEqual(aUri.toString() === bUri.toString(), exturi.isEqual(aUri, bUri))
 * ```
 */
const extUri = new ExtUri(() => false);

/**
 * BIASED utility that always ignores the casing of uris paths. ONLY use this util if you
 * understand what you are doing.
 *
 * This utility is INCOMPATIBLE with `uri.toString()`-usages and both CANNOT be used interchanged.
 *
 * When dealing with uris from files or documents, `extUri` (the unbiased friend)is sufficient
 * because those uris come from a "trustworthy source". When creating unknown uris it's always
 * better to use `IUriIdentityService` which exposes an `IExtUri`-instance which knows when path
 * casing matters.
 */
export const dirname = extUri.dirname.bind(extUri);
export const joinPath = extUri.joinPath.bind(extUri);

//#endregion
