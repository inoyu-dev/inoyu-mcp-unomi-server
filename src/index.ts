#!/usr/bin/env node
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
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ErrorCode,
  McpError
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import dotenv from "dotenv";
import {
  UnomiProfile,
  UnomiContext,
  GetProfileArgs,
  SearchProfilesArgs,
  isValidGetProfileArgs,
  isValidSearchProfilesArgs,
  GetMyProfileArgs,
  isValidGetMyProfileArgs,
  generateSessionId,
  UpdateMyProfileArgs,
  isValidUpdateMyProfileArgs,
  UnomiScope,
  CreateScopeArgs,
  isValidCreateScopeArgs,
  UpdateConsentArgs,
  isValidUpdateConsentArgs,
  GetConsentArgs,
  isValidGetConsentArgs,
  ListConsentsArgs,
  isValidListConsentsArgs,
} from "./types.js";
import fs from 'fs';
import os from 'os';
import path from 'path';

// Create a simple logging function.
// The log file location is configurable via the UNOMI_LOG_FILE env var and
// defaults to the OS temp directory, so it works on any machine. (Previously a
// hardcoded absolute path caused appendFileSync to throw ENOENT and crash the
// server on startup on every machine but the original author's.)
const LOG_FILE = process.env.UNOMI_LOG_FILE || path.join(os.tmpdir(), 'unomi-mcp-server.log');
function log(message: string) {
    try {
        const timestamp = new Date().toISOString();
        fs.appendFileSync(LOG_FILE, `${timestamp}: ${message}\n`);
    } catch {
        // Logging must never take down the MCP server.
    }
}

// Use it in your code
log('MCP server started');

dotenv.config();

const UNOMI_BASE_URL = process.env.UNOMI_BASE_URL || 'http://localhost:8181';
const UNOMI_VERSION = process.env.UNOMI_VERSION || '3'; // Default to V3
const UNOMI_USERNAME = process.env.UNOMI_USERNAME;
const UNOMI_PASSWORD = process.env.UNOMI_PASSWORD;
const UNOMI_PROFILE_ID = process.env.UNOMI_PROFILE_ID;
const UNOMI_SOURCE_ID = process.env.UNOMI_SOURCE_ID || 'claude-desktop';
const UNOMI_KEY = process.env.UNOMI_KEY;
const UNOMI_EMAIL = process.env.UNOMI_EMAIL;

// V3-specific environment variables
const UNOMI_TENANT_ID = process.env.UNOMI_TENANT_ID;
const UNOMI_PUBLIC_KEY = process.env.UNOMI_PUBLIC_KEY;
const UNOMI_PRIVATE_KEY = process.env.UNOMI_PRIVATE_KEY;

// Validate environment variables based on version
if (UNOMI_VERSION === '3') {
  // V3 requires tenant configuration
  if (!UNOMI_TENANT_ID) {
    throw new Error("UNOMI_TENANT_ID environment variable is required for Unomi V3");
  }
  if (!UNOMI_PUBLIC_KEY) {
    throw new Error("UNOMI_PUBLIC_KEY environment variable is required for Unomi V3");
  }
  if (!UNOMI_PRIVATE_KEY) {
    throw new Error("UNOMI_PRIVATE_KEY environment variable is required for Unomi V3");
  }
} else {
  // V2 requires system administrator authentication
  if (!UNOMI_USERNAME || !UNOMI_PASSWORD) {
    throw new Error("UNOMI_USERNAME and UNOMI_PASSWORD environment variables are required for Unomi V2");
  }
  if (!UNOMI_KEY) {
    throw new Error("UNOMI_KEY environment variable is required for protected events in Unomi V2");
  }
}

if (!UNOMI_PROFILE_ID) {
  throw new Error("UNOMI_PROFILE_ID environment variable is required as fallback");
}

const API_CONFIG = {
  BASE_URL: UNOMI_BASE_URL,
  VERSION: UNOMI_VERSION,
  ENDPOINTS: {
    PROFILE: '/cxs/profiles',
    SEARCH: '/cxs/profiles/search',
    SESSION: '/cxs/sessions',
    CONTEXT: '/context.json',
    SCOPE: '/cxs/scopes',
    TENANTS: '/cxs/tenants'
  }
} as const;

class UnomiServer {
  private server: Server;
  private axiosInstance;
  private defaultScope = 'claude-desktop';
  private isV3: boolean;

  constructor() {
    this.server = new Server({
      name: "unomi-profile-server",
      version: "0.1.0"
    }, {
      capabilities: {
        resources: {},
        tools: {}
      }
    });

    this.isV3 = API_CONFIG.VERSION === '3';

    // Configure axios based on Unomi version
    this.axiosInstance = this.createAxiosInstance();

    this.setupHandlers();
    this.setupErrorHandling();
  }

  private createAxiosInstance() {
    const config: any = {
      baseURL: API_CONFIG.BASE_URL
    };

    if (this.isV3) {
      // V3: Use tenant authentication for private endpoints
      config.auth = {
        username: UNOMI_TENANT_ID!,
        password: UNOMI_PRIVATE_KEY!
      };
    } else {
      // V2: Use system administrator authentication
      config.auth = {
        username: UNOMI_USERNAME!,
        password: UNOMI_PASSWORD!
      };
      config.headers = {
        'X-Unomi-Peer': UNOMI_KEY
      };
    }

    return axios.create(config);
  }

  private createPublicAxiosInstance() {
    // For public endpoints in V3 (like /context.json)
    if (this.isV3) {
      return axios.create({
        baseURL: API_CONFIG.BASE_URL,
        headers: {
          'X-Unomi-Api-Key': UNOMI_PUBLIC_KEY
        }
      });
    }
    // For V2, use the main instance
    return this.axiosInstance;
  }

  private createSystemAdminAxiosInstance() {
    // For system administrator operations (fallback in V3, primary in V2)
    return axios.create({
      baseURL: API_CONFIG.BASE_URL,
      auth: {
        username: UNOMI_USERNAME || 'karaf',
        password: UNOMI_PASSWORD || 'karaf'
      }
    });
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      console.error("[MCP Error]", error);
    };

    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupHandlers(): void {
    this.setupResourceHandlers();
    this.setupToolHandlers();
  }

  private setupResourceHandlers(): void {
    this.server.setRequestHandler(
      ListResourcesRequestSchema,
      async () => ({
        resources: [{
          uri: `unomi://profiles/list`,
          name: `Unomi Profiles`,
          mimeType: "application/json",
          description: "List of available Apache Unomi profiles"
        }]
      })
    );

    this.server.setRequestHandler(
      ReadResourceRequestSchema,
      async (request) => {
        log("Request:" + JSON.stringify(request, null, 2));
        if (request.params.uri !== 'unomi://profiles/list') {
          throw new McpError(
            ErrorCode.InvalidRequest,
            `Unknown resource: ${request.params.uri}`
          );
        }

        try {
          const response = await this.axiosInstance.post(
            API_CONFIG.ENDPOINTS.SEARCH,
            {
              offset: 0,
              limit: 10,
              condition: {
                type: "matchAllCondition"
              }
            }
          );

          return {
            contents: [{
              uri: request.params.uri,
              mimeType: "application/json",
              text: JSON.stringify(response.data, null, 2)
            }]
          };
        } catch (error) {
          if (axios.isAxiosError(error)) {
            throw new McpError(
              ErrorCode.InternalError,
              `Unomi API error: ${error.response?.data?.message ?? error.message}`
            );
          }
          throw error;
        }
      }
    );
  }

  private async ensureScopeExists(scope: string = this.defaultScope): Promise<void> {
    try {
      // Try to get the scope
      const response = await this.axiosInstance.get(`${API_CONFIG.ENDPOINTS.SCOPE}/${scope}`);
      
      // Check if scope doesn't exist (204 status or empty response)
      if (response.status === 204 || !response.data || Object.keys(response.data).length === 0) {
        // Create the scope
        const scopeData: UnomiScope = {
          itemId: scope,
          itemType: 'scope',
          metadata: {
            id: scope,
            name: `Claude Desktop Scope - ${scope}`,
          description: 'Automatically created scope for Claude Desktop MCP Server',
            scope: scope
          }
        };

        await this.axiosInstance.post(API_CONFIG.ENDPOINTS.SCOPE, scopeData);
      }
      // If we get here with data, the scope exists
    } catch (error) {
      // Handle other potential errors
      if (axios.isAxiosError(error)) {
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to check/create scope: ${error.response?.data?.message ?? error.message}`
        );
      }
      throw error;
    }
  }

  private async findProfileByEmail(email: string): Promise<string | null> {
    try {
      const response = await this.axiosInstance.post(
        API_CONFIG.ENDPOINTS.SEARCH,
        {
          condition: {
            type: "profilePropertyCondition",
            parameterValues: {
              propertyName: "properties.email",
              comparisonOperator: "equals",
              propertyValue: email
            }
          },
          limit: 1
        }
      );

      if (response.data && response.data.list && response.data.list.length > 0) {
        return response.data.list[0].itemId;
      }

      return null;
    } catch (error) {
      console.error('Error looking up profile by email:', error);
      return null;
    }
  }

  private async getEffectiveProfileId(): Promise<string> {
    if (UNOMI_EMAIL) {
      const existingProfileId = await this.findProfileByEmail(UNOMI_EMAIL);
      if (existingProfileId) {
        return existingProfileId;
      }
      // If profile not found by email, create it with the email property
      const profileId = UNOMI_PROFILE_ID!;
      try {
        const sessionId = generateSessionId(profileId);
        const contextData: UnomiContext = {
          sessionId,
          profileId,
          source: {
            itemId: UNOMI_SOURCE_ID,
            itemType: "claude",
            scope: "claude-desktop"
          },
          events: [{
            eventType: "updateProperties",
            scope: "claude-desktop",
            source: {
              itemId: UNOMI_SOURCE_ID,
              itemType: "claude",
              scope: "claude-desktop"
            },
            target: {
              itemId: profileId,
              itemType: "profile",
              scope: "claude-desktop"
            },
            properties: {
              update: {
                "properties.email": UNOMI_EMAIL
              }
            }
          }]
        };

        await this.createPublicAxiosInstance().post(API_CONFIG.ENDPOINTS.CONTEXT, contextData);
      } catch (error) {
        console.error('Error setting email for new profile:', error);
      }
      return profileId;
    }
    return UNOMI_PROFILE_ID!;
  }

  private async handleMyProfileOperation<T>(
    operation: (profileId: string, args: any) => Promise<T>, 
    args: any
  ): Promise<T> {
    const profileId = await this.getEffectiveProfileId();
    return operation(profileId, args);
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler(
      ListToolsRequestSchema,
      async () => ({
        tools: [
          {
            name: "create_scope",
            description: "Create a new Unomi scope",
            inputSchema: {
              type: "object",
              properties: {
                scope: {
                  type: "string",
                  description: "Scope identifier"
                },
                name: {
                  type: "string",
                  description: "Human-readable name for the scope"
                },
                description: {
                  type: "string",
                  description: "Description of the scope"
                }
              },
              required: ["scope"]
            }
          },
          {
            name: "update_my_profile",
            description: "Update properties of your profile using environment-provided ID",
            inputSchema: {
              type: "object",
              properties: {
                properties: {
                  type: "object",
                  description: "Key-value pairs of properties to update",
                  additionalProperties: {
                    type: ["string", "number", "boolean", "null"]
                  }
                }
              },
              required: ["properties"]
            }
          },
          {
            name: "get_my_profile",
            description: "Get your profile using environment-provided IDs",
            inputSchema: {
              type: "object",
              properties: {
                requireSegments: {
                  type: "boolean",
                  description: "Whether to include segments in the response"
                },
                requireScores: {
                  type: "boolean",
                  description: "Whether to include scores in the response"
                }
              }
            }
          },
          {
            name: "get_profile",
            description: "Get a specific Unomi profile by ID",
            inputSchema: {
              type: "object",
              properties: {
                profileId: {
                  type: "string",
                  description: "Profile ID"
                }
              },
              required: ["profileId"]
            }
          },
          {
            name: "search_profiles",
            description: "Search Unomi profiles",
            inputSchema: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "Search query"
                },
                limit: {
                  type: "number",
                  description: "Maximum number of results"
                },
                offset: {
                  type: "number",
                  description: "Result offset for pagination"
                }
              },
              required: ["query"]
            }
          },
          {
            name: "get_tenant_info",
            description: "Get information about the current tenant (V3 only)",
            inputSchema: {
              type: "object",
              properties: {}
            }
          },
          {
            name: "update_consent",
            description: "Update a user's consent status using the updateConsent event",
            inputSchema: {
              type: "object",
              properties: {
                consentId: {
                  type: "string",
                  description: "Unique identifier for the consent"
                },
                status: {
                  type: "string",
                  enum: ["GRANTED", "DENIED", "REVOKED"],
                  description: "Consent status"
                },
                typeIdentifier: {
                  type: "string",
                  description: "Type identifier of the consent (optional)"
                },
                scope: {
                  type: "string",
                  description: "Scope for the consent (optional, defaults to claude-desktop)"
                },
                metadata: {
                  type: "object",
                  description: "Additional metadata for the consent (optional)",
                  additionalProperties: true
                }
              },
              required: ["consentId", "status"]
            }
          },
          {
            name: "get_consent",
            description: "Get specific consent information for a profile",
            inputSchema: {
              type: "object",
              properties: {
                consentId: {
                  type: "string",
                  description: "Unique identifier for the consent"
                }
              },
              required: ["consentId"]
            }
          },
          {
            name: "list_consents",
            description: "List all consents for a profile with optional filtering",
            inputSchema: {
              type: "object",
              properties: {
                profileId: {
                  type: "string",
                  description: "Profile ID to list consents for (optional, uses my profile if not provided)"
                },
                status: {
                  type: "string",
                  enum: ["GRANTED", "DENIED", "REVOKED"],
                  description: "Filter by consent status (optional)"
                },
                scope: {
                  type: "string",
                  description: "Filter by scope (optional)"
                }
              }
            }
          }
        ]
      })
    );

    this.server.setRequestHandler(
      CallToolRequestSchema,
      async (request) => {
        log("Request:" + JSON.stringify(request, null, 2));
        switch (request.params.name) {
          case "create_scope": {
            if (!isValidCreateScopeArgs(request.params.arguments)) {
              throw new McpError(
                ErrorCode.InvalidParams,
                "Invalid create scope arguments"
              );
            }

            try {
              const scopeData: UnomiScope = {
                itemId: request.params.arguments.scope,
                itemType: 'scope',
                metadata : {
                  id: request.params.arguments.scope,
                  name: request.params.arguments.name,
                  description: request.params.arguments.description,
                  scope: request.params.arguments.scope
                }
              };

              await this.axiosInstance.post(API_CONFIG.ENDPOINTS.SCOPE, scopeData);

              return {
                content: [{
                  type: "text",
                  text: JSON.stringify({
                    message: "Scope created successfully",
                    scope: scopeData
                  }, null, 2)
                }]
              };
            } catch (error) {
              if (axios.isAxiosError(error)) {
                return {
                  content: [{
                    type: "text",
                    text: `Unomi API error: ${error.response?.data?.message ?? error.message}`
                  }],
                  isError: true,
                };
              }
              throw error;
            }
          }

          case "update_my_profile": {
            await this.ensureScopeExists();

            if (!isValidUpdateMyProfileArgs(request.params.arguments)) {
              throw new McpError(
                ErrorCode.InvalidParams,
                "Invalid update profile arguments"
              );
            }

            const args = request.params.arguments;
            return this.handleMyProfileOperation(async (profileId, args) => {
              try {
                const sessionId = generateSessionId(profileId);
                const contextData: UnomiContext = {
                  sessionId,
                  profileId,
                  source: {
                    itemId: UNOMI_SOURCE_ID,
                    itemType: "claude",
                    scope: "claude-desktop"
                  },
                  events: [{
                    eventType: "updateProperties",
                    scope: "claude-desktop",
                    source: {
                      itemId: UNOMI_SOURCE_ID,
                      itemType: "claude",
                      scope: "claude-desktop"
                    },
                    target: {
                      itemId: profileId,
                      itemType: "profile",
                      scope: "claude-desktop"
                    },
                    properties: {
                      update: Object.fromEntries(
                        Object.entries(args.properties).map(([key, value]) => [
                          `properties.${key}`, value
                        ])
                      )
                    }
                  }]
                };

                const response = await this.createPublicAxiosInstance().post(
                  API_CONFIG.ENDPOINTS.CONTEXT,
                  contextData
                );

                return {
                  content: [{
                    type: "text",
                    text: JSON.stringify({
                      message: "Profile properties updated successfully",
                      updatedProperties: args.properties,
                      profileId: profileId,
                      sessionId: sessionId,
                      source: UNOMI_EMAIL ? "email_lookup" : "environment"
                    }, null, 2)
                  }]
                };
              } catch (error) {
                if (axios.isAxiosError(error)) {
                  return {
                    content: [{
                      type: "text",
                      text: `Unomi API error: ${error.response?.data?.message ?? error.message}`
                    }],
                    isError: true,
                  };
                }
                throw error;
              }
            }, args);
          }

          case "get_my_profile": {
            await this.ensureScopeExists();

            if (!isValidGetMyProfileArgs(request.params.arguments)) {
              throw new McpError(
                ErrorCode.InvalidParams,
                "Invalid get my profile arguments"
              );
            }

            const args = request.params.arguments;
            return this.handleMyProfileOperation(async (profileId, args) => {
              try {
                const sessionId = generateSessionId(profileId);
                const contextData: UnomiContext = {
                  sessionId,
                  profileId,
                  source: {
                    itemId: UNOMI_SOURCE_ID,
                    itemType: "claude",
                    scope: "claude-desktop"
                  },
                  requiredProfileProperties: ["*"],
                  requiredSessionProperties: ["*"],
                  requireSegments: args.requireSegments,
                  requireScores: args.requireScores
                };

                const response = await this.createPublicAxiosInstance().post(
                  API_CONFIG.ENDPOINTS.CONTEXT,
                  contextData
                );

                return {
                  content: [{
                    type: "text",
                    text: JSON.stringify({
                      profile: response.data.profileProperties,
                      session: response.data.sessionProperties,
                      segments: response.data.profileSegments,
                      scores: response.data.profileScores,
                      sessionId: sessionId,
                      profileId: profileId,
                      source: UNOMI_EMAIL ? "email_lookup" : "environment"
                    }, null, 2)
                  }]
                };
              } catch (error) {
                if (axios.isAxiosError(error)) {
                  return {
                    content: [{
                      type: "text",
                      text: `Unomi API error: ${error.response?.data?.message ?? error.message}`
                    }],
                    isError: true,
                  };
                }
                throw error;
              }
            }, args);
          }

          case "get_profile": {
            if (!isValidGetProfileArgs(request.params.arguments)) {
              throw new McpError(
                ErrorCode.InvalidParams,
                "Invalid profile arguments"
              );
            }

            try {
              const response = await this.axiosInstance.get<UnomiProfile>(
                `${API_CONFIG.ENDPOINTS.PROFILE}/${request.params.arguments.profileId}`
              );

              return {
                content: [{
                  type: "text",
                  text: JSON.stringify(response.data, null, 2)
                }]
              };
            } catch (error) {
              if (axios.isAxiosError(error)) {
                return {
                  content: [{
                    type: "text",
                    text: `Unomi API error: ${error.response?.data?.message ?? error.message}`
                  }],
                  isError: true,
                };
              }
              throw error;
            }
          }

          case "search_profiles": {
            if (!isValidSearchProfilesArgs(request.params.arguments)) {
              throw new McpError(
                ErrorCode.InvalidParams,
                "Invalid search arguments"
              );
            }

            try {
              const { query, limit = 10, offset = 0 } = request.params.arguments;
              const response = await this.axiosInstance.post(
                API_CONFIG.ENDPOINTS.SEARCH,
                {
                  offset,
                  limit,
                  condition: {
                    type: "booleanCondition",
                    parameterValues : {
                      operator: "or",
                      subConditions: [
                        {
                          type: "profilePropertyCondition",
                          parameterValues : {
                            propertyName: "properties.firstName",
                            comparisonOperator: "contains",
                            propertyValue: query  
                          }
                        },
                        {
                          type: "profilePropertyCondition",
                          parameterValues : {
                            propertyName: "properties.lastName",
                            comparisonOperator: "contains",
                            propertyValue: query
                          }
                        },
                        {
                          type: "profilePropertyCondition",
                          parameterValues : {
                            propertyName: "properties.email",
                            comparisonOperator: "contains",
                            propertyValue: query
                          }
                        }
                      ]  
                    }
                  }
                }
              );

              return {
                content: [{
                  type: "text",
                  text: JSON.stringify(response.data, null, 2)
                }]
              };
            } catch (error) {
              if (axios.isAxiosError(error)) {
                return {
                  content: [{
                    type: "text",
                    text: `Unomi API error: ${error.response?.data?.message ?? error.message}`
                  }],
                  isError: true,
                };
              }
              throw error;
            }
          }

          case "get_tenant_info": {
            if (this.isV3) {
              try {
                const response = await this.createSystemAdminAxiosInstance().get(
                  `${API_CONFIG.ENDPOINTS.TENANTS}/${UNOMI_TENANT_ID}`
                );

                return {
                  content: [{
                    type: "text",
                    text: JSON.stringify({
                      tenant: response.data,
                      version: "V3",
                      tenantId: UNOMI_TENANT_ID,
                      hasPublicKey: !!UNOMI_PUBLIC_KEY,
                      hasPrivateKey: !!UNOMI_PRIVATE_KEY
                    }, null, 2)
                  }]
                };
              } catch (error) {
                if (axios.isAxiosError(error)) {
                  return {
                    content: [{
                      type: "text",
                      text: `Unomi API error: ${error.response?.data?.message ?? error.message}`
                    }],
                    isError: true,
                  };
                }
                throw error;
              }
            } else {
              return {
                content: [{
                  type: "text",
                  text: JSON.stringify({
                    message: "Tenant information is only available in Unomi V3",
                    version: "V2",
                    suggestion: "Upgrade to Unomi V3 or set UNOMI_VERSION=3 to enable tenant features"
                  }, null, 2)
                }]
              };
            }
          }

          case "update_consent": {
            await this.ensureScopeExists();

            if (!isValidUpdateConsentArgs(request.params.arguments)) {
              throw new McpError(
                ErrorCode.InvalidParams,
                "Invalid update consent arguments"
              );
            }

            const args = request.params.arguments;
            return this.handleMyProfileOperation(async (profileId, args) => {
              try {
                const sessionId = generateSessionId(profileId);
                const scope = args.scope || this.defaultScope;
                
                const contextData: UnomiContext = {
                  sessionId,
                  profileId,
                  source: {
                    itemId: UNOMI_SOURCE_ID,
                    itemType: "claude",
                    scope: scope
                  },
                  events: [{
                    itemId: `consent-${args.consentId}-${Date.now()}`,
                    itemType: "event",
                    eventType: "modifyConsent",
                    scope: scope,
                    sessionId: sessionId,
                    profileId: profileId,
                    timeStamp: new Date().toISOString(),
                    source: {
                      itemId: UNOMI_SOURCE_ID,
                      itemType: "claude",
                      scope: scope
                    },
                    target: {
                      itemId: profileId,
                      itemType: "profile",
                      scope: scope
                    },
                    properties: {
                      consent: {
                        scope: scope,
                        typeIdentifier: args.typeIdentifier || args.consentId,
                        status: args.status,
                        statusDate: new Date().toISOString(),
                        revokeDate: (() => {
                          const now = new Date();
                          if (args.status === "GRANTED") {
                            // GDPR recommendation: consent expires after 1 year
                            const oneYearFromNow = new Date(now.getTime() + (365 * 24 * 60 * 60 * 1000));
                            return oneYearFromNow.toISOString();
                          } else if (args.status === "DENIED" || args.status === "REVOKED") {
                            // Denied/revoked consents expire immediately
                            return now.toISOString();
                          }
                          return now.toISOString(); // fallback
                        })()
                      }
                    }
                  }]
                };

                const response = await this.createPublicAxiosInstance().post(
                  API_CONFIG.ENDPOINTS.CONTEXT,
                  contextData
                );

                return {
                  content: [{
                    type: "text",
                    text: JSON.stringify({
                      message: "Consent updated successfully",
                      consentId: args.consentId,
                      status: args.status,
                      typeIdentifier: args.typeIdentifier,
                      scope: scope,
                      profileId: profileId,
                      sessionId: sessionId,
                      source: UNOMI_EMAIL ? "email_lookup" : "environment"
                    }, null, 2)
                  }]
                };
              } catch (error) {
                if (axios.isAxiosError(error)) {
                  return {
                    content: [{
                      type: "text",
                      text: `Unomi API error: ${error.response?.data?.message ?? error.message}`
                    }],
                    isError: true,
                  };
                }
                throw error;
              }
            }, args);
          }

          case "get_consent": {
            if (!isValidGetConsentArgs(request.params.arguments)) {
              throw new McpError(
                ErrorCode.InvalidParams,
                "Invalid get consent arguments"
              );
            }

            const args = request.params.arguments;
            return this.handleMyProfileOperation(async (profileId, args) => {
              try {
                // Get the full profile to access consents
                const response = await this.axiosInstance.get<UnomiProfile>(
                  `${API_CONFIG.ENDPOINTS.PROFILE}/${profileId}`
                );

                const consents = response.data.consents || {};
                const consent = consents[args.consentId];

                if (!consent) {
                  return {
                    content: [{
                      type: "text",
                      text: JSON.stringify({
                        message: "Consent not found",
                        consentId: args.consentId,
                        profileId: profileId
                      }, null, 2)
                    }]
                  };
                }

                return {
                  content: [{
                    type: "text",
                    text: JSON.stringify({
                      consentId: args.consentId,
                      consent: consent,
                      profileId: profileId,
                      source: UNOMI_EMAIL ? "email_lookup" : "environment"
                    }, null, 2)
                  }]
                };
              } catch (error) {
                if (axios.isAxiosError(error)) {
                  return {
                    content: [{
                      type: "text",
                      text: `Unomi API error: ${error.response?.data?.message ?? error.message}`
                    }],
                    isError: true,
                  };
                }
                throw error;
              }
            }, args);
          }

          case "list_consents": {
            if (!isValidListConsentsArgs(request.params.arguments)) {
              throw new McpError(
                ErrorCode.InvalidParams,
                "Invalid list consents arguments"
              );
            }

            const args = request.params.arguments;
            const targetProfileId = args.profileId || await this.getEffectiveProfileId();
            
            try {
              // Get the full profile to access consents
              const response = await this.axiosInstance.get<UnomiProfile>(
                `${API_CONFIG.ENDPOINTS.PROFILE}/${targetProfileId}`
              );

              const consents = response.data.consents || {};
              let filteredConsents = Object.entries(consents).map(([consentId, consent]) => ({
                consentId,
                ...consent
              }));

              // Apply filters
              if (args.status) {
                filteredConsents = filteredConsents.filter(consent => consent.status === args.status);
              }
              if (args.scope) {
                filteredConsents = filteredConsents.filter(consent => (consent as any).scope === args.scope);
              }

              return {
                content: [{
                  type: "text",
                  text: JSON.stringify({
                    consents: filteredConsents,
                    totalCount: filteredConsents.length,
                    profileId: targetProfileId,
                    filters: {
                      status: args.status,
                      scope: args.scope
                    },
                    source: args.profileId ? "provided" : (UNOMI_EMAIL ? "email_lookup" : "environment")
                  }, null, 2)
                }]
              };
            } catch (error) {
              if (axios.isAxiosError(error)) {
                return {
                  content: [{
                    type: "text",
                    text: `Unomi API error: ${error.response?.data?.message ?? error.message}`
                  }],
                  isError: true,
                };
              }
              throw error;
            }
          }

          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${request.params.name}`
            );
        }
      }
    );
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Unomi MCP server running on stdio");
  }
}

const server = new UnomiServer();
server.run().catch(console.error);
