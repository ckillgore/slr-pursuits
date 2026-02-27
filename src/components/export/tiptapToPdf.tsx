'use client';

import { Text, View, StyleSheet } from '@react-pdf/renderer';
import React from 'react';

/**
 * Converts Tiptap/ProseMirror JSON to @react-pdf/renderer components.
 * Handles: paragraph, heading (h2/h3), bulletList, orderedList, listItem,
 * blockquote, horizontalRule, and inline marks (bold, italic, underline).
 */

const rs = StyleSheet.create({
    paragraph: {
        fontSize: 7.5,
        color: '#4A5568',
        marginBottom: 4,
        lineHeight: 1.5,
    },
    heading2: {
        fontSize: 9,
        fontWeight: 700,
        color: '#1A1F2B',
        marginBottom: 4,
        marginTop: 6,
    },
    heading3: {
        fontSize: 8,
        fontWeight: 700,
        color: '#4A5568',
        marginBottom: 3,
        marginTop: 4,
    },
    listItem: {
        flexDirection: 'row',
        marginBottom: 2,
        paddingLeft: 8,
    },
    bullet: {
        fontSize: 7.5,
        color: '#7A8599',
        marginRight: 4,
        width: 8,
    },
    blockquote: {
        borderLeftWidth: 2,
        borderLeftColor: '#E2E5EA',
        paddingLeft: 8,
        marginBottom: 4,
        marginLeft: 4,
    },
    hr: {
        borderBottomWidth: 0.5,
        borderBottomColor: '#E2E5EA',
        marginVertical: 6,
    },
    bold: {
        fontWeight: 700,
    },
    italic: {
        fontStyle: 'italic',
    },
    underline: {
        textDecoration: 'underline',
    },
});

interface TiptapNode {
    type?: string;
    content?: TiptapNode[];
    text?: string;
    marks?: { type: string }[];
    attrs?: Record<string, unknown>;
}

/** Render inline text with marks (bold, italic, underline) */
function renderTextNode(node: TiptapNode, key: number): React.ReactNode {
    if (!node.text) return null;

    const styles: import('@react-pdf/types').Style[] = [];
    if (node.marks) {
        for (const mark of node.marks) {
            if (mark.type === 'bold') styles.push(rs.bold);
            if (mark.type === 'italic') styles.push(rs.italic);
            if (mark.type === 'underline') styles.push(rs.underline);
        }
    }

    return (
        <Text key={key} style={styles.length > 0 ? styles : undefined}>
            {node.text}
        </Text>
    );
}

/** Render inline content (array of text nodes within a paragraph/heading) */
function renderInlineContent(nodes?: TiptapNode[]): React.ReactNode[] {
    if (!nodes) return [];
    return nodes.map((child, i) => renderTextNode(child, i));
}

/** Recursively render a Tiptap node tree into react-pdf components */
function renderNode(node: TiptapNode, key: number): React.ReactNode {
    switch (node.type) {
        case 'doc':
            return (
                <View key={key}>
                    {node.content?.map((child, i) => renderNode(child, i))}
                </View>
            );

        case 'paragraph':
            return (
                <Text key={key} style={rs.paragraph}>
                    {renderInlineContent(node.content)}
                </Text>
            );

        case 'heading': {
            const level = (node.attrs?.level as number) ?? 2;
            return (
                <Text key={key} style={level === 3 ? rs.heading3 : rs.heading2}>
                    {renderInlineContent(node.content)}
                </Text>
            );
        }

        case 'bulletList':
            return (
                <View key={key}>
                    {node.content?.map((child, i) => renderListItem(child, i, '•'))}
                </View>
            );

        case 'orderedList':
            return (
                <View key={key}>
                    {node.content?.map((child, i) => renderListItem(child, i, `${i + 1}.`))}
                </View>
            );

        case 'blockquote':
            return (
                <View key={key} style={rs.blockquote}>
                    {node.content?.map((child, i) => renderNode(child, i))}
                </View>
            );

        case 'horizontalRule':
            return <View key={key} style={rs.hr} />;

        case 'text':
            return renderTextNode(node, key);

        default:
            // Unknown node types — try to render children
            if (node.content) {
                return (
                    <View key={key}>
                        {node.content.map((child, i) => renderNode(child, i))}
                    </View>
                );
            }
            return null;
    }
}

function renderListItem(node: TiptapNode, index: number, marker: string): React.ReactNode {
    // List items contain paragraph(s) inside
    const paragraphs = node.content || [];
    return (
        <View key={index} style={rs.listItem}>
            <Text style={rs.bullet}>{marker}</Text>
            <View style={{ flex: 1 }}>
                {paragraphs.map((child, i) => {
                    // Render paragraph content inline without extra margin
                    if (child.type === 'paragraph') {
                        return (
                            <Text key={i} style={{ ...rs.paragraph, marginBottom: 1 }}>
                                {renderInlineContent(child.content)}
                            </Text>
                        );
                    }
                    return renderNode(child, i);
                })}
            </View>
        </View>
    );
}

/**
 * Convert a Tiptap JSON document to react-pdf components.
 * Pass the `exec_summary` or `arch_notes` JSON directly.
 */
export function TiptapPdfContent({ content }: { content: Record<string, unknown> | null }) {
    if (!content) return null;
    return <>{renderNode(content as unknown as TiptapNode, 0)}</>;
}
