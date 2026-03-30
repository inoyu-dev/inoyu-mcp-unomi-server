# Inoyu Apache Unomi MCP Server

A Model Context Protocol server enabling Claude to maintain user context through Apache Unomi profile management.

> ⚠️ **Early Implementation Notice**
>
> This is an early implementation intended for demonstration purposes:
> - Not validated for production use
> - Subject to changes
> - Not (yet) officially supported
> - For learning and experimentation only

## Current Scope

This implementation provides:
- Profile lookup and creation using email
- Profile property management
- Basic session handling
- Scope management for context isolation

Other Unomi features (events, segments, session properties, etc.) are not currently implemented. Community feedback welcome on future development priorities.

## Demo

Watch how the MCP server enables Claude to maintain context and manage user profiles:

[![Apache Unomi MCP Server Demo](https://img.youtube.com/vi/YqPkUhBlcrs/0.jpg)](https://www.youtube.com/watch?v=YqPkUhBlcrs)

## Hosted deployment

A hosted deployment is available on [Fronteir AI](https://fronteir.ai/mcp/sergehuber-inoyu-mcp-unomi-server).

## Installation

To use with Claude Desktop, add the server config and environment variables:

On MacOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
On Windows: `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "unomi-server": {
      "command": "npx",
      "args": ["@inoyu/mcp-unomi-server"],
      "env": {
        "UNOMI_BASE_URL": "http://your-unomi-server:8181",
        "UNOMI_VERSION": "3", // Use "2" for Unomi V2, "3" for Unomi V3 (default)
        "UNOMI_USERNAME": "your-username", // Required for V2, fallback for V3
        "UNOMI_PASSWORD": "your-password", // Required for V2, fallback for V3
        "UNOMI_PROFILE_ID": "your-profile-id",
        "UNOMI_KEY": "your-unomi-key", // Required for V2 only
        "UNOMI_EMAIL": "your-email@example.com",
        "UNOMI_SOURCE_ID": "claude-desktop",
        "UNOMI_TENANT_ID": "your-tenant-id", // Required for V3
        "UNOMI_PUBLIC_KEY": "your-public-key", // Required for V3
        "UNOMI_PRIVATE_KEY": "your-private-key" // Required for V3
      }
    }
  }
}
```

The `env` section in the configuration allows you to set the required environment variables for the server. Replace the values with your actual Unomi server details.

Make sure to restart Claude Desktop after updating the configuration. You can then click on the tools icon on the lower right of the chat window to make sure it has found all the tools provided by this server.

## Features

### Profile Access
- Email-based profile lookup with automatic creation
- Profile properties, segments, and scores access
- JSON format for all data exchange
- Automatic session management with date-based IDs

### Tools
- `get_my_profile` - Get your profile using environment variables
  - Uses UNOMI_PROFILE_ID from environment or email lookup
  - Automatically generates a session ID based on the current date
  - Optional parameters:
    - requireSegments: Include segment information
    - requireScores: Include scoring information
- `update_my_profile` - Update properties of your profile
  - Uses UNOMI_PROFILE_ID from environment or email lookup
  - Takes a properties object with key-value pairs to update
  - Supports string, number, boolean, and null values
  - Example:
    ```json
    {
      "properties": {
        "firstName": "John",
        "age": 30,
        "isSubscribed": true,
        "oldProperty": null
      }
    }
    ```
- `get_profile` - Retrieve a specific profile by ID
  - Takes profileId as required parameter
  - Returns full profile data from Unomi
- `search_profiles` - Search for profiles
  - Takes query string and optional limit/offset parameters
  - Searches across firstName, lastName, and email fields
- `create_scope` - Create a new Unomi scope
  - Takes scope identifier and optional name/description
  - Required for event tracking and profile updates
  - Example:
    ```json
    {
      "scope": "my-app",
      "name": "My Application",
      "description": "Scope for my application events"
    }
    ```
- `get_tenant_info` - Get information about the current tenant (V3 only)
  - Returns tenant details, version information, and key status
  - Only available when using Unomi V3
  - No parameters required

### Consent Management Tools
- `update_consent` - Update a user's consent status using the modifyConsent event
  - Uses the Apache Unomi Consent API as described in the [official documentation](https://unomi.apache.org/manual/latest/#_consent_api)
  - Required parameters:
    - consentId: Unique identifier for the consent
    - status: Consent status (GRANTED, DENIED, or REVOKED)
  - Optional parameters:
    - typeIdentifier: Type identifier of the consent
    - scope: Scope for the consent (defaults to claude-desktop)
    - metadata: Additional metadata for the consent
  - GDPR Compliance: 
    - GRANTED consents expire after 1 year (GDPR recommendation)
    - DENIED/REVOKED consents expire immediately
  - Example:
    ```json
    {
      "consentId": "marketing-consent",
      "status": "GRANTED",
      "typeIdentifier": "marketing",
      "scope": "claude-desktop",
      "metadata": {
        "source": "claude-desktop",
        "timestamp": "2024-01-15T10:30:00Z"
      }
    }
    ```

- `get_consent` - Get specific consent information for a profile
  - Takes consentId as required parameter
  - Returns consent details including status, timestamp, and metadata
  - Uses your profile by default (from environment or email lookup)
  - Example:
    ```json
    {
      "consentId": "marketing-consent"
    }
    ```

- `list_consents` - List all consents for a profile with optional filtering
  - Optional parameters:
    - profileId: Profile ID to list consents for (uses your profile if not provided)
    - status: Filter by consent status (GRANTED, DENIED, or REVOKED)
    - scope: Filter by scope
  - Returns filtered list of consents with metadata
  - Example:
    ```json
    {
      "status": "GRANTED",
      "scope": "claude-desktop"
    }
    ```

### Scope Management
The server automatically manages scopes for you:

1. Default Scope:
   - A default scope `claude-desktop` is used for all operations
   - Created automatically when needed
   - Used for profile updates and event tracking

2. Custom Scopes:
   - Can be created using the `create_scope` tool
   - Useful for separating different applications or contexts
   - Must exist before using in profile operations

3. Automatic Scope Creation:
   - The server checks if required scopes exist
   - Creates them automatically if missing
   - Uses meaningful defaults for scope metadata

> **Note**: While scopes are created automatically when needed, you can still create them manually with custom names and descriptions using the `create_scope` tool.

## Apache Unomi V2/V3 Compatibility

This MCP server supports both Apache Unomi V2 and V3 with automatic version detection and appropriate authentication methods.

### Version Detection

The server automatically detects the Unomi version based on the `UNOMI_VERSION` environment variable:
- `UNOMI_VERSION=2` - Uses V2 authentication (system administrator)
- `UNOMI_VERSION=3` - Uses V3 authentication (tenant-based) - **Default**

### V2 vs V3 Authentication

**V2 (Legacy):**
- Uses system administrator authentication (`karaf/karaf` by default)
- All operations use the same authentication method
- Requires `UNOMI_USERNAME`, `UNOMI_PASSWORD`, and `UNOMI_KEY`

**V3 (Multi-tenant):**
- Uses tenant-based authentication with API keys
- Different authentication for different endpoint types:
  - **Public endpoints** (`/context.json`): Uses `X-Unomi-Api-Key` header with public key
  - **Private endpoints** (profiles, scopes): Uses tenant authentication (`tenantId:privateKey`)
  - **System operations**: Falls back to system administrator authentication
- Requires `UNOMI_TENANT_ID`, `UNOMI_PUBLIC_KEY`, and `UNOMI_PRIVATE_KEY`

### Migration from V2 to V3

1. **Update environment variables:**
   ```bash
   # Remove V2-specific variables
   # UNOMI_KEY (no longer needed)
   
   # Add V3-specific variables
   UNOMI_VERSION=3
   UNOMI_TENANT_ID=your-tenant-id
   UNOMI_PUBLIC_KEY=your-public-key
   UNOMI_PRIVATE_KEY=your-private-key
   ```

2. **Benefits of V3:**
   - Complete data isolation between tenants
   - Enhanced security with tenant-specific API keys
   - Better scalability for multi-tenant deployments
   - Improved compliance with data privacy regulations

## Overview

This MCP server enables Claude to maintain context about users through Apache Unomi's profile management system. Here's what you can achieve with it:

### Key Capabilities
1. **User Recognition**:
   - Identify users across conversations using email or profile ID
   - Maintain consistent user context between sessions
   - Automatically create and manage user profiles

2. **Context Management**:
   - Store and retrieve user preferences
   - Manage user consent preferences
   - Track consent status and history

3. **Consent Management**:
   - Update user consent status using Apache Unomi's Consent API
   - Retrieve specific consent information
   - List and filter consents by status and scope
   - Automatic consent expiration handling (GDPR compliant)
   - Support for GDPR and privacy compliance

4. **Integration Features**:
   - Seamless Claude Desktop integration
   - Automatic session management
   - Scope-based context isolation

### What You Can Do
- Have Claude remember user preferences across conversations
- Store and retrieve user-specific information
- Maintain consistent user context
- Manage multiple users through email identification
- Track and manage user consent preferences
- Comply with privacy regulations (GDPR, CCPA, etc.)
- Update consent status in real-time
- Query consent history and status

### Prerequisites
- Running Apache Unomi server
- Claude Desktop installation
- Network access to Unomi server
- Proper security configuration
- Required environment variables

## Configuration

### Environment Variables

The server requires the following environment variables:

```bash
UNOMI_BASE_URL=http://your-unomi-server:8181
UNOMI_USERNAME=your-username
UNOMI_PASSWORD=your-password
UNOMI_PROFILE_ID=your-profile-id
UNOMI_SOURCE_ID=your-source-id
UNOMI_KEY=your-unomi-key
UNOMI_EMAIL=your-email
```

### Profile Resolution

The server uses a two-step process to resolve the profile ID:

1. Email Lookup (if `UNOMI_EMAIL` is set):
   - Searches for a profile with matching email
   - If found, uses that profile's ID
   - Useful for maintaining consistent profile across sessions

2. Fallback Profile ID:
   - If email lookup fails or `UNOMI_EMAIL` is not set
   - Uses the `UNOMI_PROFILE_ID` from environment
   - Ensures a profile is always available

The response will indicate which method was used via the `source` field:
- `"email_lookup"`: Profile found via email
- `"environment"`: Using fallback profile ID

### Unomi Server Configuration

1. Configure protected events in `etc/org.apache.unomi.cluster.cfg`:
   ```properties
   # Required for protected events like property updates
   org.apache.unomi.cluster.authorization.key=your-unomi-key
   
   # Required to allow Claude Desktop to access Unomi
   # Replace your-claude-desktop-ip with your actual IP
   org.apache.unomi.ip.ranges=127.0.0.1,::1,your-claude-desktop-ip
   ```

2. Ensure your Unomi server has CORS properly configured in `etc/org.apache.unomi.cors.cfg`:
   ```properties
   # Add your Claude Desktop origin if needed
   org.apache.unomi.cors.allowed.origins=http://localhost:*
   ```

3. Restart Unomi server to apply changes

> **Important**: The Unomi key must match exactly between your server configuration and the UNOMI_KEY environment variable in Claude Desktop.

## Configuration

### Environment Variables

The server requires the following environment variables:

```bash
UNOMI_BASE_URL=http://your-unomi-server:8181
UNOMI_USERNAME=your-username
UNOMI_PASSWORD=your-password
UNOMI_PROFILE_ID=your-profile-id
UNOMI_SOURCE_ID=your-source-id
UNOMI_KEY=your-unomi-key
UNOMI_EMAIL=your-email
```

### Profile Resolution

The server uses a two-step process to resolve the profile ID:

1. Email Lookup (if `UNOMI_EMAIL` is set):
   - Searches for a profile with matching email
   - If found, uses that profile's ID
   - Useful for maintaining consistent profile across sessions

2. Fallback Profile ID:
   - If email lookup fails or `UNOMI_EMAIL` is not set
   - Uses the `UNOMI_PROFILE_ID` from environment
   - Ensures a profile is always available

The response will indicate which method was used via the `source` field:
- `"email_lookup"`: Profile found via email
- `"environment"`: Using fallback profile ID

### Unomi Server Configuration

1. Configure protected events in `etc/org.apache.unomi.cluster.cfg`:
   ```properties
   # Required for protected events like property updates
   org.apache.unomi.cluster.authorization.key=your-unomi-key
   
   # Required to allow Claude Desktop to access Unomi
   # Replace your-claude-desktop-ip with your actual IP
   org.apache.unomi.ip.ranges=127.0.0.1,::1,your-claude-desktop-ip
   ```

2. Ensure your Unomi server has CORS properly configured in `etc/org.apache.unomi.cors.cfg`:
   ```properties
   # Add your Claude Desktop origin if needed
   org.apache.unomi.cors.allowed.origins=http://localhost:*
   ```

3. Restart Unomi server to apply changes

> **Important**: The Unomi key must match exactly between your server configuration and the UNOMI_KEY environment variable in Claude Desktop.

## Development

Install dependencies:
```bash
npm install
```

Build the server:
```bash
npm run build
```

For development with auto-rebuild:
```bash
npm run watch
```

### Debugging

Since MCP servers communicate over stdio, debugging can be challenging. We recommend using the [MCP Inspector](https://github.com/modelcontextprotocol/inspector), which is available as a package script:

```bash
npm run inspector
```

The Inspector will provide a URL to access debugging tools in your browser.

You can also tail the Claude Desktop logs to see MCP requests and responses:

```bash
# Follow logs in real-time
tail -n 20 -f ~/Library/Logs/Claude/mcp*.log
```

### Session ID Format
When using `get_my_profile`, the session ID is automatically generated using the format:
```
[profileId]-YYYYMMDD
```
For example, if your profile ID is "user123" and today is March 15, 2024, the session ID would be:
```
user123-20240315
```

## Troubleshooting

### Common Issues

1. **Protected Events Failing**
   - Verify Unomi key matches exactly in both configurations
   - Check IP address is correctly whitelisted
   - Ensure scope exists before updating properties
   - Verify CORS configuration if needed

2. **Profile Not Found**
   - Check if UNOMI_EMAIL is correctly set
   - Verify email format is valid
   - Ensure profile exists in Unomi
   - Check if fallback UNOMI_PROFILE_ID is valid

3. **Session Issues**
   - Remember sessions are date-based
   - Only one session per profile per day
   - Check session ID format matches `profileId-YYYYMMDD`
   - Verify scope exists for session

4. **Connection Problems**
   - Verify Unomi server is running
   - Check network connectivity
   - Ensure UNOMI_BASE_URL is correct
   - Verify authentication credentials

### Logs to Check

1. **Claude Desktop Logs**:
   ```bash
   # MacOS
   ~/Library/Logs/Claude/mcp*.log
   
   # Windows
   %APPDATA%\Claude\mcp*.log
   ```

2. **Unomi Server Logs**:
   ```bash
   # Usually in
   $UNOMI_HOME/logs/karaf.log
   ```

### Quick Fixes

1. **Reset State**:
   ```bash
   # Stop Claude Desktop
   # Clear logs
   rm ~/Library/Logs/Claude/mcp*.log
   # Restart Claude Desktop
   ```

2. **Verify Configuration**:
   ```bash
   # Check Unomi connection
   curl -u username:password http://your-unomi-server:8181/cxs/cluster
   
   # Test scope exists
   curl -u username:password http://your-unomi-server:8181/cxs/scopes/claude-desktop
   ```

### Claude Desktop Configuration options

1. Create or edit your Claude Desktop configuration:
   - MacOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%/Claude/claude_desktop_config.json`

2. Add the server configuration using NPX:
   ```json
   {
     "mcpServers": {
       "unomi-server": {
         "command": "npx",
         "args": ["@inoyu/mcp-unomi-server"],
         "env": {
           "UNOMI_BASE_URL": "http://your-unomi-server:8181",
           "UNOMI_USERNAME": "your-username",
           "UNOMI_PASSWORD": "your-password",
           "UNOMI_PROFILE_ID": "your-profile-id",
           "UNOMI_KEY": "your-unomi-key",
           "UNOMI_EMAIL": "your-email@example.com",
           "UNOMI_SOURCE_ID": "claude-desktop"
         }
       }
     }
   }
   ```

> **Note**: Using NPX ensures you're always running the latest published version of the server.

Alternatively, if you want to use a specific version:
```json
{
  "mcpServers": {
    "unomi-server": {
      "command": "npx",
      "args": ["@inoyu/mcp-unomi-server@0.1.0"],
      "env": {
        // ... environment variables ...
      }
    }
  }
}
```

For development or local installations:
```json
{
  "mcpServers": {
    "unomi-server": {
      "command": "node",
      "args": ["/path/to/local/mcp-unomi-server/build/index.js"],
      "env": {
        // ... environment variables ...
      }
    }
  }
}
```

