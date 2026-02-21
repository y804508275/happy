import * as React from 'react';
import { View } from 'react-native';
import { useLocalSettingMutable } from '@/sync/storage';
import { Item } from '@/components/Item';
import { ItemGroup } from '@/components/ItemGroup';
import { ItemList } from '@/components/ItemList';
import { Switch } from '@/components/Switch';
import { Ionicons } from '@expo/vector-icons';
import { t } from '@/text';

const IDLE_TIMEOUT_OPTIONS = [5, 10, 15, 30] as const;

export default React.memo(function NotificationsSettings() {
    const [notifyPermission, setNotifyPermission] = useLocalSettingMutable('notifyPermissionRequest');
    const [notifyComplete, setNotifyComplete] = useLocalSettingMutable('notifyTaskComplete');
    const [notifyError, setNotifyError] = useLocalSettingMutable('notifyError');
    const [notifyIdle, setNotifyIdle] = useLocalSettingMutable('notifyIdleTimeout');
    const [idleMinutes, setIdleMinutes] = useLocalSettingMutable('notifyIdleTimeoutMinutes');

    return (
        <ItemList>
            <ItemGroup
                title={t('notifications.categories')}
                footer={t('notifications.categoriesFooter')}
            >
                <Item
                    title={t('notifications.permissionRequest')}
                    subtitle={t('notifications.permissionRequestDesc')}
                    icon={<Ionicons name="shield-checkmark-outline" size={29} color="#FF9500" />}
                    rightElement={<Switch value={notifyPermission} onValueChange={setNotifyPermission} />}
                    showChevron={false}
                />
                <Item
                    title={t('notifications.taskComplete')}
                    subtitle={t('notifications.taskCompleteDesc')}
                    icon={<Ionicons name="checkmark-circle-outline" size={29} color="#34C759" />}
                    rightElement={<Switch value={notifyComplete} onValueChange={setNotifyComplete} />}
                    showChevron={false}
                />
                <Item
                    title={t('notifications.error')}
                    subtitle={t('notifications.errorDesc')}
                    icon={<Ionicons name="alert-circle-outline" size={29} color="#FF3B30" />}
                    rightElement={<Switch value={notifyError} onValueChange={setNotifyError} />}
                    showChevron={false}
                />
            </ItemGroup>

            <ItemGroup
                title={t('notifications.idleTimeout')}
                footer={t('notifications.idleTimeoutFooter')}
            >
                <Item
                    title={t('notifications.enableIdleTimeout')}
                    subtitle={t('notifications.enableIdleTimeoutDesc')}
                    icon={<Ionicons name="timer-outline" size={29} color="#5856D6" />}
                    rightElement={<Switch value={notifyIdle} onValueChange={setNotifyIdle} />}
                    showChevron={false}
                />
                {notifyIdle && (
                    <>
                        {IDLE_TIMEOUT_OPTIONS.map((minutes) => (
                            <Item
                                key={minutes}
                                title={t('notifications.minutesOption', { count: minutes })}
                                icon={<View style={{ width: 29 }} />}
                                detail={idleMinutes === minutes ? '✓' : undefined}
                                onPress={() => setIdleMinutes(minutes)}
                                showChevron={false}
                            />
                        ))}
                    </>
                )}
            </ItemGroup>
        </ItemList>
    );
});
