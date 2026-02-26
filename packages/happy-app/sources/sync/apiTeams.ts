import { AuthCredentials } from '@/auth/tokenStorage';
import { backoff } from '@/utils/time';
import { getServerUrl } from './serverConfig';
import type { TeamSummary, TeamDetail } from './sharedItemTypes';

/**
 * List teams the user belongs to
 */
export async function fetchTeams(credentials: AuthCredentials): Promise<{ teams: TeamSummary[] }> {
    const API_ENDPOINT = getServerUrl();

    return await backoff(async () => {
        const response = await fetch(`${API_ENDPOINT}/v1/teams`, {
            headers: {
                'Authorization': `Bearer ${credentials.token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch teams: ${response.status}`);
        }

        return await response.json();
    });
}

/**
 * Get team details including members
 */
export async function fetchTeam(credentials: AuthCredentials, teamId: string): Promise<TeamDetail> {
    const API_ENDPOINT = getServerUrl();

    return await backoff(async () => {
        const response = await fetch(`${API_ENDPOINT}/v1/teams/${teamId}`, {
            headers: {
                'Authorization': `Bearer ${credentials.token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch team: ${response.status}`);
        }

        return await response.json();
    });
}

/**
 * Create a new team
 */
export async function createTeam(
    credentials: AuthCredentials,
    data: { name: string; description?: string }
): Promise<TeamSummary> {
    const API_ENDPOINT = getServerUrl();

    return await backoff(async () => {
        const response = await fetch(`${API_ENDPOINT}/v1/teams`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${credentials.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            throw new Error(`Failed to create team: ${response.status}`);
        }

        return await response.json();
    });
}

/**
 * Update a team
 */
export async function updateTeam(
    credentials: AuthCredentials,
    teamId: string,
    data: { name?: string; description?: string | null }
): Promise<void> {
    const API_ENDPOINT = getServerUrl();

    return await backoff(async () => {
        const response = await fetch(`${API_ENDPOINT}/v1/teams/${teamId}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${credentials.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            throw new Error(`Failed to update team: ${response.status}`);
        }
    });
}

/**
 * Delete a team
 */
export async function deleteTeam(credentials: AuthCredentials, teamId: string): Promise<void> {
    const API_ENDPOINT = getServerUrl();

    return await backoff(async () => {
        const response = await fetch(`${API_ENDPOINT}/v1/teams/${teamId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${credentials.token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to delete team: ${response.status}`);
        }
    });
}

/**
 * Add a member to a team
 */
export async function addTeamMember(
    credentials: AuthCredentials,
    teamId: string,
    accountId: string,
    role?: 'admin' | 'member'
): Promise<void> {
    const API_ENDPOINT = getServerUrl();

    return await backoff(async () => {
        const response = await fetch(`${API_ENDPOINT}/v1/teams/${teamId}/members`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${credentials.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ accountId, role: role || 'member' })
        });

        if (!response.ok) {
            throw new Error(`Failed to add team member: ${response.status}`);
        }
    });
}

/**
 * Remove a member from a team
 */
export async function removeTeamMember(
    credentials: AuthCredentials,
    teamId: string,
    accountId: string
): Promise<void> {
    const API_ENDPOINT = getServerUrl();

    return await backoff(async () => {
        const response = await fetch(`${API_ENDPOINT}/v1/teams/${teamId}/members/${accountId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${credentials.token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to remove team member: ${response.status}`);
        }
    });
}

/**
 * Change a member's role
 */
export async function changeTeamMemberRole(
    credentials: AuthCredentials,
    teamId: string,
    accountId: string,
    role: 'admin' | 'member'
): Promise<void> {
    const API_ENDPOINT = getServerUrl();

    return await backoff(async () => {
        const response = await fetch(`${API_ENDPOINT}/v1/teams/${teamId}/members/${accountId}/role`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${credentials.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ role })
        });

        if (!response.ok) {
            throw new Error(`Failed to change member role: ${response.status}`);
        }
    });
}
