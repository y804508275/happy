import * as React from "react";
import { View, Text, Image as RNImage } from "react-native";
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { FileIcon } from './FileIcon';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { MarkdownView } from "./markdown/MarkdownView";
import { t } from '@/text';
import { Message, UserTextMessage, AgentTextMessage, ToolCallMessage } from "@/sync/typesMessage";
import { Metadata } from "@/sync/storageTypes";
import { layout } from "./layout";
import { ToolView } from "./tools/ToolView";
import { AgentEvent } from "@/sync/typesRaw";
import { sync } from '@/sync/sync';
import { Option } from './markdown/MarkdownView';
import { useSetting } from "@/sync/storage";

function useMessageEntrance(shouldAnimate: boolean) {
  const opacity = useSharedValue(shouldAnimate ? 0 : 1);

  React.useEffect(() => {
    if (shouldAnimate) {
      opacity.value = withTiming(1, { duration: 400, easing: Easing.out(Easing.quad) });
    }
  }, []);

  return useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));
}

export const MessageView = React.memo((props: {
  message: Message;
  metadata: Metadata | null;
  sessionId: string;
  getMessageById?: (id: string) => Message | null;
}) => {
  const isRecent = Date.now() - props.message.createdAt < 3000;
  const animStyle = useMessageEntrance(isRecent);

  return (
    <Animated.View style={[styles.messageContainer, animStyle]} renderToHardwareTextureAndroid={true}>
      <View style={styles.messageContent}>
        <RenderBlock
          message={props.message}
          metadata={props.metadata}
          sessionId={props.sessionId}
          getMessageById={props.getMessageById}
        />
      </View>
    </Animated.View>
  );
});

// RenderBlock function that dispatches to the correct component based on message kind
function RenderBlock(props: {
  message: Message;
  metadata: Metadata | null;
  sessionId: string;
  getMessageById?: (id: string) => Message | null;
}): React.ReactElement {
  switch (props.message.kind) {
    case 'user-text':
      return <UserTextBlock message={props.message} sessionId={props.sessionId} />;

    case 'agent-text':
      return <AgentTextBlock message={props.message} sessionId={props.sessionId} />;

    case 'tool-call':
      return <ToolCallBlock
        message={props.message}
        metadata={props.metadata}
        sessionId={props.sessionId}
        getMessageById={props.getMessageById}
      />;

    case 'agent-event':
      return <AgentEventBlock event={props.message.event} metadata={props.metadata} />;


    default:
      // Exhaustive check - TypeScript will error if we miss a case
      const _exhaustive: never = props.message;
      throw new Error(`Unknown message kind: ${_exhaustive}`);
  }
}

function UserTextBlock(props: {
  message: UserTextMessage;
  sessionId: string;
}) {
  const { theme } = useUnistyles();
  const handleOptionPress = React.useCallback((option: Option) => {
    sync.sendMessage(props.sessionId, option.title);
  }, [props.sessionId]);

  const mdRefs = props.message.meta?.mdReferences;

  return (
    <View style={styles.userMessageContainer}>
      <View style={[styles.userMessageBubble, !(mdRefs && mdRefs.length > 0) && { marginBottom: 12 }]}>
        {props.message.images && props.message.images.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: props.message.text ? 8 : 0 }}>
            {props.message.images.map((img, i) => (
              <RNImage
                key={i}
                source={{ uri: `data:${img.mediaType};base64,${img.data}` }}
                style={{ width: 160, height: 160, borderRadius: 8 }}
                resizeMode="cover"
              />
            ))}
          </View>
        )}
        {props.message.files && props.message.files.length > 0 && (
          <View style={{ flexDirection: 'column', gap: 6, marginBottom: props.message.text ? 8 : 0 }}>
            {props.message.files.map((file, i) => (
              <View key={i} style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: 'rgba(255,255,255,0.12)',
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 10,
                gap: 10,
                minWidth: 180,
              }}>
                <FileIcon fileName={file.name} size={28} />
                <View style={{ flex: 1, gap: 1 }}>
                  <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.95)', fontWeight: '600' }} numberOfLines={2}>
                    {file.name}
                  </Text>
                  <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }} numberOfLines={1}>
                    {file.mediaType === 'application/pdf' ? 'PDF' :
                     file.mediaType.startsWith('text/') ? file.mediaType.replace('text/', '').toUpperCase() :
                     file.name.split('.').pop()?.toUpperCase() || 'FILE'}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
        {props.message.text ? (
          <MarkdownView markdown={props.message.displayText || props.message.text} onOptionPress={handleOptionPress} />
        ) : null}
      </View>
      {mdRefs && mdRefs.length > 0 && (
        <View style={styles.mdRefTagsContainer}>
          {mdRefs.map((name, i) => (
            <View key={i} style={styles.mdRefTag}>
              <Ionicons name="document-text-outline" size={11} color={theme.colors.textSecondary} />
              <Text style={styles.mdRefTagText} numberOfLines={1}>{name}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function AgentTextBlock(props: {
  message: AgentTextMessage;
  sessionId: string;
}) {
  const experiments = useSetting('experiments');
  const handleOptionPress = React.useCallback((option: Option) => {
    sync.sendMessage(props.sessionId, option.title);
  }, [props.sessionId]);

  // Hide thinking messages unless experiments is enabled
  if (props.message.isThinking && !experiments) {
    return null;
  }

  return (
    <View style={[styles.agentMessageContainer, props.message.isThinking && { opacity: 0.3 }]}>
      <MarkdownView markdown={props.message.text} onOptionPress={handleOptionPress} />
    </View>
  );
}

function AgentEventBlock(props: {
  event: AgentEvent;
  metadata: Metadata | null;
}) {
  if (props.event.type === 'switch') {
    return (
      <View style={styles.agentEventContainer}>
        <Text style={styles.agentEventText}>{t('message.switchedToMode', { mode: props.event.mode })}</Text>
      </View>
    );
  }
  if (props.event.type === 'message') {
    const isRuleApplied = props.event.message.startsWith('Rule applied:') || props.event.message.startsWith('✅ Rule applied:');
    if (isRuleApplied) {
      const displayText = props.event.message.replace(/^✅\s*/, '');
      return (
        <View style={styles.ruleAppliedContainer}>
          <Text style={styles.ruleAppliedText}>{displayText}</Text>
        </View>
      );
    }
    return (
      <View style={styles.agentEventContainer}>
        <Text style={styles.agentEventText}>{props.event.message}</Text>
      </View>
    );
  }
  if (props.event.type === 'limit-reached') {
    const formatTime = (timestamp: number): string => {
      try {
        const date = new Date(timestamp * 1000); // Convert from Unix timestamp
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } catch {
        return t('message.unknownTime');
      }
    };

    return (
      <View style={styles.agentEventContainer}>
        <Text style={styles.agentEventText}>
          {t('message.usageLimitUntil', { time: formatTime(props.event.endsAt) })}
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.agentEventContainer}>
      <Text style={styles.agentEventText}>{t('message.unknownEvent')}</Text>
    </View>
  );
}

function ToolCallBlock(props: {
  message: ToolCallMessage;
  metadata: Metadata | null;
  sessionId: string;
  getMessageById?: (id: string) => Message | null;
}) {
  if (!props.message.tool) {
    return null;
  }
  return (
    <View style={styles.toolContainer}>
      <ToolView
        tool={props.message.tool}
        metadata={props.metadata}
        messages={props.message.children}
        sessionId={props.sessionId}
        messageId={props.message.id}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  messageContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  messageContent: {
    flexDirection: 'column',
    flexGrow: 1,
    flexBasis: 0,
    maxWidth: layout.maxWidth,
  },
  userMessageContainer: {
    maxWidth: '100%',
    flexDirection: 'column',
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
  },
  userMessageBubble: {
    backgroundColor: theme.colors.userMessageBackground,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    maxWidth: '100%',
  },
  mdRefTagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 4,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  mdRefTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: theme.colors.divider,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  mdRefTagText: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    maxWidth: 120,
  },
  agentMessageContainer: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 16,
    alignSelf: 'flex-start',
  },
  agentEventContainer: {
    marginHorizontal: 8,
    alignItems: 'center',
    paddingVertical: 8,
  },
  agentEventText: {
    color: theme.colors.agentEventText,
    fontSize: 14,
  },
  ruleAppliedContainer: {
    marginHorizontal: 16,
    alignItems: 'flex-start',
    paddingVertical: 1,
  },
  ruleAppliedText: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    opacity: 0.5,
  },
  toolContainer: {
    marginHorizontal: 8,
  },
  debugText: {
    color: theme.colors.agentEventText,
    fontSize: 12,
  },
}));
