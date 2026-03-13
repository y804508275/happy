import * as React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { SessionsList } from './SessionsList';
import { useVisibleSessionListViewData } from '@/hooks/useVisibleSessionListViewData';

const stylesheet = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
    },
    loadingContainerWrapper: {
        flex: 1,
        flexBasis: 0,
        flexGrow: 1,
        backgroundColor: theme.colors.groupped.background,
    },
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingBottom: 32,
    },
}));

export const SessionsListWrapper = React.memo(() => {
    const { theme } = useUnistyles();
    const sessionListViewData = useVisibleSessionListViewData();
    const styles = stylesheet;

    if (sessionListViewData === null) {
        return (
            <View style={styles.container}>
                <View style={styles.loadingContainerWrapper}>
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                    </View>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <SessionsList />
        </View>
    );
});