/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
export interface UnomiProfile {
    itemId: string;
    properties: {
        firstName?: string;
        lastName?: string;
        email?: string;
        [key: string]: any;
    };
    segments: string[];
    scores: {
        [key: string]: number;
    };
    consents: {
        [key: string]: {
            status: string;
            timestamp: number;
        };
    };
    systemProperties: {
        [key: string]: any;
    };
}

export interface GetProfileArgs {
    profileId: string;
}

export interface SearchProfilesArgs {
    query: string;
    limit?: number;
    offset?: number;
}

export interface UnomiContext {
    sessionId: string;
    profileId: string;
    source: {
        itemId: string;
        itemType: string;
        scope: string;
    };
    requiredProfileProperties?: string[];
    requiredSessionProperties?: string[];
    requireSegments?: boolean;
    requireScores?: boolean;
    events?: any[];
}

export interface GetMyProfileArgs {
    requireSegments?: boolean;
    requireScores?: boolean;
}

export interface UpdateMyProfileArgs {
    properties: {
        [key: string]: string | number | boolean | null;
    };
}

export interface UnomiScope {
    itemId: string;
    itemType: string;
    metadata: {
        id:string,
        name?: string;
        description?: string;
        scope: string;
    };
}

export interface CreateScopeArgs {
    scope: string;
    name?: string;
    description?: string;
}

export interface UnomiConsent {
    id: string;
    status: 'GRANTED' | 'DENIED' | 'PENDING';
    timestamp: number;
    purpose?: string;
    scope?: string;
    metadata?: {
        [key: string]: any;
    };
}

export interface UpdateConsentArgs {
    consentId: string;
    status: 'GRANTED' | 'DENIED' | 'REVOKED';
    typeIdentifier?: string;
    scope?: string;
    metadata?: {
        [key: string]: any;
    };
}

export interface GetConsentArgs {
    consentId: string;
}

export interface ListConsentsArgs {
    profileId?: string;
    status?: 'GRANTED' | 'DENIED' | 'REVOKED';
    scope?: string;
}

// Type guard for get profile arguments
export function isValidGetProfileArgs(args: any): args is GetProfileArgs {
    return (
        typeof args === "object" &&
        args !== null &&
        "profileId" in args &&
        typeof args.profileId === "string"
    );
}

// Type guard for search profiles arguments
export function isValidSearchProfilesArgs(args: any): args is SearchProfilesArgs {
    return (
        typeof args === "object" &&
        args !== null &&
        "query" in args &&
        typeof args.query === "string" &&
        (args.limit === undefined || typeof args.limit === "number") &&
        (args.offset === undefined || typeof args.offset === "number")
    );
}

// Type guard for get my profile arguments
export function isValidGetMyProfileArgs(args: any): args is GetMyProfileArgs {
    return (
        typeof args === "object" &&
        args !== null &&
        (args.requireSegments === undefined || typeof args.requireSegments === "boolean") &&
        (args.requireScores === undefined || typeof args.requireScores === "boolean")
    );
}

// Type guard for update my profile arguments
export function isValidUpdateMyProfileArgs(args: any): args is UpdateMyProfileArgs {
    return (
        typeof args === "object" &&
        args !== null &&
        "properties" in args &&
        typeof args.properties === "object" &&
        args.properties !== null &&
        Object.entries(args.properties).every(([_, value]) => 
            value === null || 
            typeof value === "string" || 
            typeof value === "number" || 
            typeof value === "boolean"
        )
    );
}

// Type guard for create scope arguments
export function isValidCreateScopeArgs(args: any): args is CreateScopeArgs {
    return (
        typeof args === "object" &&
        args !== null &&
        "scope" in args &&
        typeof args.scope === "string" &&
        (args.name === undefined || typeof args.name === "string") &&
        (args.description === undefined || typeof args.description === "string")
    );
}

// Type guard for update consent arguments
export function isValidUpdateConsentArgs(args: any): args is UpdateConsentArgs {
    return (
        typeof args === "object" &&
        args !== null &&
        "consentId" in args &&
        typeof args.consentId === "string" &&
        "status" in args &&
        (args.status === "GRANTED" || args.status === "DENIED" || args.status === "REVOKED") &&
        (args.typeIdentifier === undefined || typeof args.typeIdentifier === "string") &&
        (args.scope === undefined || typeof args.scope === "string") &&
        (args.metadata === undefined || typeof args.metadata === "object")
    );
}

// Type guard for get consent arguments
export function isValidGetConsentArgs(args: any): args is GetConsentArgs {
    return (
        typeof args === "object" &&
        args !== null &&
        "consentId" in args &&
        typeof args.consentId === "string"
    );
}

// Type guard for list consents arguments
export function isValidListConsentsArgs(args: any): args is ListConsentsArgs {
    return (
        typeof args === "object" &&
        args !== null &&
        (args.profileId === undefined || typeof args.profileId === "string") &&
        (args.status === undefined || args.status === "GRANTED" || args.status === "DENIED" || args.status === "REVOKED") &&
        (args.scope === undefined || typeof args.scope === "string")
    );
}

// Helper function to generate session ID with date
export function generateSessionId(profileId: string): string {
    const now = new Date();
    const datePart = now.toISOString().split('T')[0].replace(/-/g, '');
    return `${profileId}-${datePart}`;
}
