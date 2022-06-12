/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

interface ICommand {
	command: string;
	title: string;
	category?: string;
}

interface IGrammar {
	language: string;
}

interface IKeyBinding {
	command: string;
	key: string;
	when?: string;
	mac?: string;
	linux?: string;
	win?: string;
}

interface ILanguage {
	id: string;
	extensions: string[];
	aliases: string[];
}

interface ISnippet {
	language: string;
}

interface ITheme {
	label: string;
}

interface IColor {
	id: string;
	description: string;
	defaults: { light: string; dark: string; highContrast: string };
}

interface ICodeActionContributionAction {
	readonly kind: string;
	readonly title: string;
	readonly description?: string;
}

interface ICodeActionContribution {
	readonly languages: readonly string[];
	readonly actions: readonly ICodeActionContributionAction[];
}

interface IExtensionContributions {
	commands?: ICommand[];
	grammars?: IGrammar[];
	keybindings?: IKeyBinding[];
	languages?: ILanguage[];
	snippets?: ISnippet[];
	themes?: ITheme[];
	colors?: IColor[];
	readonly codeActions?: readonly ICodeActionContribution[];
}

interface IExtensionCapabilities {
	readonly virtualWorkspaces?: ExtensionVirtualWorkspaceSupport;
	readonly untrustedWorkspaces?: ExtensionUntrustedWorkspaceSupport;
}

type LimitedWorkspaceSupportType = 'limited';
type ExtensionUntrustedWorkspaceSupport = { supported: true } | { supported: false; description: string } | { supported: LimitedWorkspaceSupportType; description: string; restrictedConfigurations?: string[] };

type ExtensionVirtualWorkspaceSupport = boolean | { supported: true } | { supported: false | LimitedWorkspaceSupportType; description: string };

interface IRelaxedExtensionManifest {
	name: string;
	displayName?: string;
	publisher: string;
	version: string;
	engines: { readonly vscode: string };
	description?: string;
	main?: string;
	browser?: string;
	icon?: string;
	categories?: string[];
	keywords?: string[];
	activationEvents?: string[];
	extensionDependencies?: string[];
	extensionPack?: string[];
	contributes?: IExtensionContributions;
	repository?: { url: string };
	bugs?: { url: string };
	enabledApiProposals?: readonly string[];
	api?: string;
	scripts?: { [key: string]: string };
	capabilities?: IExtensionCapabilities;
}

export type IExtensionManifest = Readonly<IRelaxedExtensionManifest>;
