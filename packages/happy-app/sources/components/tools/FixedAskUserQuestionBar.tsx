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
import { useInlineOptions } from '@/hooks/useInlineOptions';
import { layout } from '@/components/layout';

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
 * In 'all' autoConfirmMode, auto-selects the first option after a brief delay.
 */
export const FixedAskUserQuestionBar = React.memo((props: {
    sessionId: string;
    metadata: Metadata | null;
    isConnected: boolean;
    autoConfirmMode?: 'off' | 'confirm' | 'all';
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

    if (!props.isConnected || !pendingQuestion) {
        return null;
    }

    return (
        <View style={barStyles.container}>
            <FixedQuestionContent
                tool={pendingQuestion.tool}
                sessionId={props.sessionId}
                autoConfirmMode={props.autoConfirmMode}
            />
        </View>
    );
});

const FixedQuestionContent = React.memo(({ tool, sessionId, autoConfirmMode }: {
    tool: ToolCall;
    sessionId: string;
    autoConfirmMode?: 'off' | 'confirm' | 'all';
}) => {
    const { theme } = useUnistyles();
    const [currentQuestionIndex, setCurrentQuestionIndex] = React.useState(0);
    const [focusedIndex, setFocusedIndex] = React.useState(0);
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [submittedIndex, setSubmittedIndex] = React.useState<number | null>(null);
    // Track selections for all questions: questionIndex → optionIndex
    const [allSelections, setAllSelections] = React.useState<Map<number, number>>(new Map());
    const focusedIndexRef = React.useRef(0);
    focusedIndexRef.current = focusedIndex;

    const questions = (tool.input as any)?.questions as Question[] | undefined;
    if (!questions || !Array.isArray(questions) || questions.length === 0) return null;

    const totalQuestions = questions.length;
    const question = questions[currentQuestionIndex];
    const options = question.options;
    const optionCount = options.length;

    const handleSelect = React.useCallback(async (optionIndex: number) => {
        if (isSubmitting) return;

        const newSelections = new Map(allSelections);
        newSelections.set(currentQuestionIndex, optionIndex);
        setAllSelections(newSelections);

        // If there are more questions, advance to the next one
        if (currentQuestionIndex < totalQuestions - 1) {
            setSubmittedIndex(optionIndex);
            // Brief visual feedback, then move to next question
            setTimeout(() => {
                setCurrentQuestionIndex(prev => prev + 1);
                setFocusedIndex(0);
                focusedIndexRef.current = 0;
                setSubmittedIndex(null);
            }, 200);
            return;
        }

        // Last question — submit all answers
        setIsSubmitting(true);
        setSubmittedIndex(optionIndex);

        // Store all selections in cache so AskUserQuestionView can show them when completed
        const permissionId = tool.permission?.id;
        if (permissionId) {
            const selectionsMap = new Map<number, Set<number>>();
            newSelections.forEach((oIdx, qIdx) => {
                selectionsMap.set(qIdx, new Set([oIdx]));
            });
            askQuestionSelectionsCache.set(permissionId, selectionsMap);
        }

        // Build response for all questions
        const responseLines: string[] = [];
        for (let i = 0; i < totalQuestions; i++) {
            const selectedIdx = newSelections.get(i);
            const selectedLabel = selectedIdx != null
                ? (questions[i].options[selectedIdx]?.label || '-')
                : '-';
            responseLines.push(`${questions[i].header}: ${selectedLabel}`);
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
    }, [sessionId, tool.permission?.id, questions, totalQuestions, currentQuestionIndex, allSelections, isSubmitting]);

    const handleSelectRef = React.useRef(handleSelect);
    handleSelectRef.current = handleSelect;

    // Auto-select first option in 'all' mode after a brief delay for each question
    const autoTriggeredForQuestion = React.useRef(-1);
    React.useEffect(() => {
        if (autoConfirmMode !== 'all' || autoTriggeredForQuestion.current >= currentQuestionIndex || isSubmitting) return;
        autoTriggeredForQuestion.current = currentQuestionIndex;
        // Highlight first option immediately, then submit after delay
        setFocusedIndex(0);
        const timer = setTimeout(() => {
            handleSelectRef.current(0);
        }, 300);
        return () => clearTimeout(timer);
    }, [autoConfirmMode, isSubmitting, currentQuestionIndex]);

    // Register keyboard handler with InlineOptionsProvider (replaces window listener)
    const { setExternalHandler } = useInlineOptions();
    React.useEffect(() => {
        if (Platform.OS !== 'web') return;

        setExternalHandler((key: string, shiftKey: boolean): boolean => {
            if (key === 'ArrowUp') {
                setFocusedIndex(i => {
                    const next = (i - 1 + optionCount) % optionCount;
                    focusedIndexRef.current = next;
                    return next;
                });
                return true;
            } else if (key === 'ArrowDown') {
                setFocusedIndex(i => {
                    const next = (i + 1) % optionCount;
                    focusedIndexRef.current = next;
                    return next;
                });
                return true;
            } else if (key === 'Enter' && !shiftKey) {
                handleSelectRef.current(focusedIndexRef.current);
                return true;
            }
            return false;
        });

        return () => setExternalHandler(null);
    }, [optionCount, setExternalHandler]);

    // Show previous selections as breadcrumb
    const previousSelections = React.useMemo(() => {
        const items: { header: string; label: string }[] = [];
        for (let i = 0; i < currentQuestionIndex; i++) {
            const selectedIdx = allSelections.get(i);
            if (selectedIdx != null) {
                items.push({
                    header: questions[i].header,
                    label: questions[i].options[selectedIdx]?.label || '-',
                });
            }
        }
        return items;
    }, [currentQuestionIndex, allSelections, questions]);

    return (
        <View style={contentStyles.wrapper}>
            {/* Previous selections breadcrumb */}
            {previousSelections.length > 0 && (
                <View style={contentStyles.breadcrumbContainer}>
                    {previousSelections.map((sel, idx) => (
                        <Text key={idx} style={contentStyles.breadcrumbText}>
                            {sel.header}: {sel.label}
                        </Text>
                    ))}
                </View>
            )}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={contentStyles.questionText}>
                    {totalQuestions > 1 && (
                        <Text style={contentStyles.questionProgress}>({currentQuestionIndex + 1}/{totalQuestions}) </Text>
                    )}
                    {question.question}
                </Text>
                {autoConfirmMode === 'all' && (
                    <Text style={[contentStyles.autoLabel, { color: theme.colors.radio.active }]}>Auto</Text>
                )}
            </View>
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
                        disabled={isSubmitting || submittedIndex !== null}
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
        alignSelf: 'center',
        width: '100%',
        maxWidth: layout.maxWidth,
    },
}));

const contentStyles = StyleSheet.create((theme) => ({
    wrapper: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        gap: 8,
    },
    breadcrumbContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    breadcrumbText: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        backgroundColor: theme.colors.surfaceHighest,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 4,
        overflow: 'hidden',
    },
    questionText: {
        fontSize: 15,
        fontWeight: '500',
        color: theme.colors.text,
        flex: 1,
    },
    questionProgress: {
        fontSize: 13,
        fontWeight: '600',
        color: theme.colors.textSecondary,
    },
    autoLabel: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 0.5,
        textTransform: 'uppercase',
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
