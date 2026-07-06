/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import { Codicon } from '../../../base/common/codicons.js';
import { basename, delimiter, normalize } from '../../../base/common/path.js';
import { isLinux, isWindows } from '../../../base/common/platform.js';
import { findExecutable } from '../../../base/node/processes.js';
import { hasKey, isObject, isString } from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
import * as pfs from '../../../base/node/pfs.js';
import { enumeratePowerShellInstallations } from '../../../base/node/powershell.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { ILogService } from '../../log/common/log.js';
import { ITerminalEnvironment, ITerminalExecutable, ITerminalProfile, ITerminalProfileSource, ITerminalUnsafePath, ProfileSource, TerminalIcon, TerminalSettingId } from '../common/terminal.js';
import { ThemeIcon } from '../../../base/common/themables.js';

const enum Constants {
	UnixShellsPath = '/etc/shells'
}

let profileSources: Map<string, IPotentialTerminalProfile> | undefined;

export function detectAvailableProfiles(
	profiles: unknown,
	defaultProfile: unknown,
	includeDetectedProfiles: boolean,
	configurationService: IConfigurationService,
	shellEnv: typeof process.env = process.env,
	fsProvider?: IFsProvider,
	logService?: ILogService,
	variableResolver?: (text: string[]) => Promise<string[]>,
	testPwshSourcePaths?: string[]
): Promise<ITerminalProfile[]> {
	fsProvider = fsProvider || {
		existsFile: pfs.SymlinkSupport.existsFile,
		readFile: fs.promises.readFile
	};
	if (isWindows) {
		return detectAvailableWindowsProfiles(
			includeDetectedProfiles,
			fsProvider,
			shellEnv,
			logService,
			'PowerShell',
			testPwshSourcePaths,
			variableResolver
		);
	}
	return detectAvailableUnixProfiles(
		fsProvider,
		logService,
		includeDetectedProfiles,
		profiles && isObject(profiles) ? { ...profiles } : configurationService.getValue<{ [key: string]: IUnresolvedTerminalProfile }>(isLinux ? TerminalSettingId.ProfilesLinux : TerminalSettingId.ProfilesMacOs),
		isString(defaultProfile) ? defaultProfile : configurationService.getValue<string>(isLinux ? TerminalSettingId.DefaultProfileLinux : TerminalSettingId.DefaultProfileMacOs),
		testPwshSourcePaths,
		variableResolver,
		shellEnv
	);
}

async function detectAvailableWindowsProfiles(
	includeDetectedProfiles: boolean,
	fsProvider: IFsProvider,
	shellEnv: typeof process.env,
	logService?: ILogService,
	defaultProfileName?: string,
	testPwshSourcePaths?: string[],
	variableResolver?: (text: string[]) => Promise<string[]>
): Promise<ITerminalProfile[]> {
	await initializeWindowsProfiles(testPwshSourcePaths);

	const detectedProfiles: Map<string, IUnresolvedTerminalProfile> = new Map();

	if (includeDetectedProfiles) {
		detectedProfiles.set('PowerShell', {
			source: ProfileSource.Pwsh,
			icon: Codicon.terminalPowershell,
			isAutoDetected: true
		});
	}

	return await transformToTerminalProfiles(detectedProfiles.entries(), defaultProfileName, fsProvider, shellEnv, logService, variableResolver);
}

async function transformToTerminalProfiles(
	entries: IterableIterator<[string, IUnresolvedTerminalProfile]>,
	defaultProfileName: string | undefined,
	fsProvider: IFsProvider,
	shellEnv: typeof process.env = process.env,
	logService?: ILogService,
	variableResolver?: (text: string[]) => Promise<string[]>,
): Promise<ITerminalProfile[]> {
	const promises: Promise<ITerminalProfile | undefined>[] = [];
	for (const [profileName, profile] of entries) {
		promises.push(getValidatedProfile(profileName, profile, defaultProfileName, fsProvider, shellEnv, logService, variableResolver));
	}
	return (await Promise.all(promises)).filter(e => !!e);
}

async function getValidatedProfile(
	profileName: string,
	profile: IUnresolvedTerminalProfile,
	defaultProfileName: string | undefined,
	fsProvider: IFsProvider,
	shellEnv: typeof process.env = process.env,
	logService?: ILogService,
	variableResolver?: (text: string[]) => Promise<string[]>
): Promise<ITerminalProfile | undefined> {
	if (profile === null) {
		return undefined;
	}
	let originalPaths: (string | ITerminalUnsafePath)[];
	let args: string[] | string | undefined;
	let icon: ThemeIcon | URI | { light: URI; dark: URI } | undefined = undefined;
	// use calculated values if path is not specified
	if (hasKey(profile, { source: true })) {
		const source = profileSources?.get(profile.source);
		if (!source) {
			return undefined;
		}
		originalPaths = source.paths;

		// if there are configured args, override the default ones
		args = profile.args || source.args;
		if (profile.icon) {
			icon = validateIcon(profile.icon);
		} else if (source.icon) {
			icon = source.icon;
		}
	} else {
		originalPaths = Array.isArray(profile.path) ? profile.path : [profile.path];
		args = isWindows ? profile.args : Array.isArray(profile.args) ? profile.args : undefined;
		icon = validateIcon(profile.icon);
	}

	let paths: (string | ITerminalUnsafePath)[];
	if (variableResolver) {
		// Convert to string[] for resolve
		const mapped = originalPaths.map(e => isString(e) ? e : e.path);

		const resolved = await variableResolver(mapped);
		// Convert resolved back to (T | string)[]
		paths = new Array(originalPaths.length);
		for (let i = 0; i < originalPaths.length; i++) {
			if (isString(originalPaths[i])) {
				paths[i] = resolved[i];
			} else {
				paths[i] = {
					path: resolved[i],
					isUnsafe: true
				};
			}
		}
	} else {
		paths = originalPaths.slice();
	}

	let requiresUnsafePath: string | undefined;
	if (profile.requiresPath) {
		// Validate requiresPath exists
		let actualRequiredPath: string;
		if (isString(profile.requiresPath)) {
			actualRequiredPath = profile.requiresPath;
		} else {
			actualRequiredPath = profile.requiresPath.path;
			if (profile.requiresPath.isUnsafe) {
				requiresUnsafePath = actualRequiredPath;
			}
		}
		const result = await fsProvider.existsFile(actualRequiredPath);
		if (!result) {
			return;
		}
	}

	const validatedProfile = await validateProfilePaths(profileName, defaultProfileName, paths, fsProvider, shellEnv, args, profile.env, profile.overrideName, profile.isAutoDetected, requiresUnsafePath);
	if (!validatedProfile) {
		logService?.debug('Terminal profile not validated', profileName, originalPaths);
		return undefined;
	}

	validatedProfile.isAutoDetected = profile.isAutoDetected;
	validatedProfile.icon = icon;
	validatedProfile.color = profile.color;
	return validatedProfile;
}

function validateIcon(icon: string | TerminalIcon | undefined): TerminalIcon | undefined {
	if (isString(icon)) {
		return { id: icon };
	}
	return icon;
}

async function initializeWindowsProfiles(testPwshSourcePaths?: string[]): Promise<void> {
	if (profileSources && !testPwshSourcePaths) {
		return;
	}

	const pwshPaths = testPwshSourcePaths || await getPowershellPaths();

	profileSources = new Map();
	profileSources.set(ProfileSource.Pwsh, {
		profileName: 'PowerShell',
		paths: pwshPaths,
		icon: Codicon.terminalPowershell
	});
}

async function getPowershellPaths(): Promise<string[]> {
	const paths: string[] = [];
	for await (const pwshExe of enumeratePowerShellInstallations()) {
		if (basename(pwshExe.exePath).toLowerCase() === 'pwsh.exe') {
			paths.push(pwshExe.exePath);
		}
	}
	paths.push('pwsh.exe');
	return paths;
}

async function detectAvailableUnixProfiles(
	fsProvider: IFsProvider,
	logService?: ILogService,
	includeDetectedProfiles?: boolean,
	configProfiles?: { [key: string]: IUnresolvedTerminalProfile },
	defaultProfileName?: string,
	testPaths?: string[],
	variableResolver?: (text: string[]) => Promise<string[]>,
	shellEnv?: typeof process.env
): Promise<ITerminalProfile[]> {
	const detectedProfiles: Map<string, IUnresolvedTerminalProfile> = new Map();

	// Add non-quick launch profiles
	if (includeDetectedProfiles && await fsProvider.existsFile(Constants.UnixShellsPath)) {
		const contents = (await fsProvider.readFile(Constants.UnixShellsPath)).toString();
		const profiles = (
			(testPaths || contents.split('\n'))
				.map(e => {
					const index = e.indexOf('#');
					return index === -1 ? e : e.substring(0, index);
				})
				.filter(e => e.trim().length > 0)
		);
		const counts: Map<string, number> = new Map();
		for (const profile of profiles) {
			let profileName = basename(profile);
			let count = counts.get(profileName) || 0;
			count++;
			if (count > 1) {
				profileName = `${profileName} (${count})`;
			}
			counts.set(profileName, count);
			detectedProfiles.set(profileName, { path: profile, isAutoDetected: true });
		}
	}

	applyConfigProfilesToMap(configProfiles, detectedProfiles);

	return await transformToTerminalProfiles(detectedProfiles.entries(), defaultProfileName, fsProvider, shellEnv, logService, variableResolver);
}

function applyConfigProfilesToMap(configProfiles: { [key: string]: IUnresolvedTerminalProfile } | undefined, profilesMap: Map<string, IUnresolvedTerminalProfile>) {
	if (!configProfiles) {
		return;
	}
	for (const [profileName, value] of Object.entries(configProfiles)) {
		if (value === null || !isObject(value) || (!hasKey(value, { path: true }) && !hasKey(value, { source: true }))) {
			profilesMap.delete(profileName);
		} else {
			value.icon = value.icon || profilesMap.get(profileName)?.icon;
			profilesMap.set(profileName, value);
		}
	}
}

async function validateProfilePaths(profileName: string, defaultProfileName: string | undefined, potentialPaths: (string | ITerminalUnsafePath)[], fsProvider: IFsProvider, shellEnv: typeof process.env, args?: string[] | string, env?: ITerminalEnvironment, overrideName?: boolean, isAutoDetected?: boolean, requiresUnsafePath?: string): Promise<ITerminalProfile | undefined> {
	if (potentialPaths.length === 0) {
		return Promise.resolve(undefined);
	}
	const path = potentialPaths.shift()!;
	if (path === '') {
		return validateProfilePaths(profileName, defaultProfileName, potentialPaths, fsProvider, shellEnv, args, env, overrideName, isAutoDetected);
	}
	const isUnsafePath = !isString(path) && path.isUnsafe;
	const actualPath = isString(path) ? path : path.path;

	const profile: ITerminalProfile = {
		profileName,
		path: actualPath,
		args,
		env,
		overrideName,
		isAutoDetected,
		isDefault: profileName === defaultProfileName,
		isUnsafePath,
		requiresUnsafePath
	};

	// For non-absolute paths, check if it's available on $PATH
	if (basename(actualPath) === actualPath) {
		// The executable isn't an absolute path, try find it on the PATH
		const envPaths: string[] | undefined = shellEnv.PATH ? shellEnv.PATH.split(delimiter) : undefined;
		const executable = await findExecutable(actualPath, undefined, envPaths, undefined, fsProvider.existsFile);
		if (!executable) {
			return validateProfilePaths(profileName, defaultProfileName, potentialPaths, fsProvider, shellEnv, args);
		}
		profile.path = executable;
		profile.isFromPath = true;
		return profile;
	}

	const result = await fsProvider.existsFile(normalize(actualPath));
	if (result) {
		return profile;
	}

	return validateProfilePaths(profileName, defaultProfileName, potentialPaths, fsProvider, shellEnv, args, env, overrideName, isAutoDetected);
}

export interface IFsProvider {
	existsFile(path: string): Promise<boolean>;
	readFile(path: string): Promise<Buffer>;
}

interface IPotentialTerminalProfile {
	profileName: string;
	paths: string[];
	args?: string[];
	icon?: ThemeIcon | URI | { light: URI; dark: URI };
}

export type IUnresolvedTerminalProfile = ITerminalExecutable | ITerminalProfileSource | null;
