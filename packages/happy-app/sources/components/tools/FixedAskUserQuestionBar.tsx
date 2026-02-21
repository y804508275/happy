import * as React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useSessionMessages } from '@/sync/storage';
import { ToolCall, ToolCallMessage } from '@/sync/typesMessage';
import { Metadata } from '@/sync/storageTypes';
import { sessionAllow } from '@/sync/ops';
import { sync } from '@/sync/sync';
import { t } from '@/text';
import { askQuestionSelectionsCache } from './views/AskUserQuestionView';

interface QuestionOption {
    label: string;
    description: string;
}

interface Question {
    question: string;
    header: string;
    options: QuestionOption[];
    multiSelect: boolean;
}

/**
 * Renders pending AskUserQuestion options in a fixed position above the input bar.
 * Supports keyboard navigation (up/down/Enter) on web.
 * For single-select questions, selecting an option auto-submits the answer.
 */
export const FixedAskUserQuestionBar = React.memo((props: {
    sessionId: string;
    metadata: Metadata | null;
}) => {
    const { messages } = useSessionMessages(props.sessionId);

    // Find the most recent running AskUserQuestion
    const pendingQuestion = React.useMemo(() => {
        for (const msg of messages) {
            if (msg.kind === 'tool-call') {
                const toolMsg = msg as ToolCallMessage;
                if (toolMsg.tool?.name === 'AskUserQuestion' && toolMsg.tool.state === 'running') {
                    return toolMsg;
                }
            }
        }
        return null;
    }, [messages]);

    if (!pendingQuestion) {
        return null;
    }

    return (
        <View style={barStyles.container}>
            <FixedQuestionContent
                tool={pendingQuestion.tool}
                sessionId={props.sessionId}
            />
        </View>
    );
});

const FixedQuestionContent = React.memo(({ tool, sessionId }: {
    tool: ToolCall;
    sessionId: string;
}) => {
    const { theme } = useUnistyles();
    const [focusedIndex, setFocusedIndex] = React.useState(0);
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [submittedIndex, setSubmittedIndex] = React.useState<number | null>(null);
    const focusedIndexRef = React.useRef(0);
    focusedIndexRef.current = focusedIndex;

    const questions = (tool.input as any)?.questions as Question[] | undefined;
    if (!questions || !Array.isArray(questions) || questions.length === 0) return null;

    // Handle the first question in the fixed bar
    const question = questions[0];
    const options = question.options;
    const optionCount = options.length;

    const handleSelect = React.useCallback(async (optionIndex: number) => {
        if (isSubmitting) return;
        setIsSubmitting(true);
        setSubmittedIndex(optionIndex);

        // Store selection in cache so AskUserQuestionView can show it when completed
        const permissionId = tool.permission?.id;
        if (permissionId) {
            const selectionsMap = new Map<number, Set<number>>();
            selectionsMap.set(0, new Set([optionIndex]));
            askQuestionSelectionsCache.set(permissionId, selectionsMap);
        }

        const selectedLabel = options[optionIndex]?.label || '';
        // Build response for all questions (use first option of first question for single-select)
        const responseLines: string[] = [];
        responseLines.push(`${question.header}: ${selectedLabel}`);
        // Include default/empty for remaining questions if multi-question
        for (let i = 1; i < questions.length; i++) {
            responseLines.push(`${questions[i].header}: -`);
        }
        const responseText = responseLines.join('\n');

        try {
            if (tool.permission?.id) {
                await sessionAllow(sessionId, tool.permission.id);
            }
            await sync.sendMessage(sessionId, responseText);
        } catch (error) {
            console.error('Failed to submit answer:', error);
            setIsSubmitting(false);
            setSubmittedIndex(null);
        }
    }, [sessionId, tool.permission?.id, options, question.header, questions, isSubmitting]);

    const handleSelectRef = React.useRef(handleSelect);
    handleSelectRef.current = handleSelect;

    // Keyboard navigation: up/down to select, enter to confirm (web only)
    React.useEffect(() => {
        if (Platform.OS !== 'web') return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                setFocusedIndex(i => {
                    const next = (i - 1 + optionCount) % optionCount;
                    focusedIndexRef.current = next;
                    return next;
                });
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setFocusedIndex(i => {
                    const next = (i + 1) % optionCount;
                    focusedIndexRef.current = next;
                    return next;
                });
            } else if (e.key === 'Enter') {
                e.preventDefault();
                handleSelectRef.current(focusedIndexRef.current);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [optionCount]);

    return (
        <View style={contentStyles.wrapper}>
            <Text style={contentStyles.questionText}>{question.question}</Text>
            <View style={contentStyles.optionsContainer}>
                {options.map((option, index) => (
                    <TouchableOpacity
                        key={index}
                        style={[
                            contentStyles.optionButton,
                            focusedIndex === index && contentStyles.optionButtonFocused,
                            submittedIndex === index && contentStyles.optionButtonSubmitted,
                            (isSubmitting && submittedIndex !== index) && contentStyles.optionButtonDisabled,
                        ]}
                        onPress={() => handleSelect(index)}
                        disabled={isSubmitting}
                        activeOpacity={0.7}
                    >
                        {isSubmitting && submittedIndex === index ? (
                            <ActivityIndicator size="small" color={theme.colors.text} />
                        ) : (
                            <View style={contentStyles.optionContent}>
                                <Text style={[
                                    contentStyles.optionLabel,
                                    focusedIndex === index && contentStyles.optionLabelFocused,
                                ]}>{option.label}</Text>
                                {option.description ? (
                                    <Text style={contentStyles.optionDescription}>{option.description}</Text>
                                ) : null}
                            </View>
                        )}
                    </TouchableOpacity>
                ))}
            </View>
        </View>
    );
});

const barStyles = StyleSheet.create((theme) => ({
    container: {
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: theme.colors.divider,
        backgroundColor: theme.colors.surface,
    },
}));

const contentStyles = StyleSheet.create((theme) => ({
    wrapper: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        gap: 8,
    },
    questionText: {
        fontSize: 15,
        fontWeight: '500',
        color: theme.colors.text,
    },
    optionsContainer: {
        gap: 4,
    },
    optionButton: {
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 8,
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: theme.colors.divider,
        borderLeftWidth: 3,
        borderLeftColor: 'transparent',
    },
    optionButtonFocused: {
        backgroundColor: theme.colors.surfaceHigh,
        borderLeftColor: theme.colors.textSecondary,
    },
    optionButtonSubmitted: {
        backgroundColor: theme.colors.surfaceHigh,
        borderLeftColor: theme.colors.text,
    },
    optionButtonDisabled: {
        opacity: 0.3,
    },
    optionContent: {
        gap: 2,
    },
    optionLabel: {
        fontSize: 14,
        fontWeight: '500',
        color: theme.colors.text,
    },
    optionLabelFocused: {
        fontWeight: '600',
    },
    optionDescription: {
        fontSize: 13,
        color: theme.colors.textSecondary,
    },
}));
