export interface SharedItemSummary {
    id: string;
    type: 'skill' | 'context';
    visibility: 'private' | 'team' | 'public';
    authorId: string;
    teamId: string | null;
    name: string;
    slug: string;
    description: string | null;
    usageCount: number;
    starCount: number;
    isStarred: boolean;
    createdAt: number;
    updatedAt: number;
}

export interface SharedItemFull extends SharedItemSummary {
    content: string;
    contentVersion: number;
    meta: any;
}

export interface TeamSummary {
    id: string;
    name: string;
    description: string | null;
    myRole: 'owner' | 'admin' | 'member';
    memberCount: number;
    createdAt: number;
    updatedAt: number;
}

export interface TeamMember {
    id: string;
    accountId: string;
    username: string | null;
    firstName: string | null;
    role: 'owner' | 'admin' | 'member';
    createdAt: number;
}

export interface TeamDetail {
    id: string;
    name: string;
    description: string | null;
    myRole: 'owner' | 'admin' | 'member';
    members: TeamMember[];
    createdAt: number;
    updatedAt: number;
}

export interface SessionSharedItemSummary {
    id: string;
    type: 'skill' | 'context';
    name: string;
    slug: string;
    description: string | null;
    authorId: string;
    addedAt: number;
}

export interface SessionSharedItemContent {
    id: string;
    type: 'skill' | 'context';
    name: string;
    slug: string;
    content: string;
}
