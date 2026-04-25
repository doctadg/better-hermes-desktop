/**
 * FileTree — expandable/collapsible directory tree with file icons.
 *
 * Currently a placeholder: shows a static example tree and a "Connect to
 * server to browse files" message. Will be wired to a real FS API later.
 */

import { useState, useCallback } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileText,
  FileCode2,
  FileJson,
  FileType,
  FolderCog,
  Server,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface TreeNode {
  name: string;
  type: 'file' | 'folder';
  children?: TreeNode[];
}

interface FileTreeProps {
  tree?: TreeNode[];
  onFileClick?: (path: string) => void;
  connected?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Static demo tree                                                   */
/* ------------------------------------------------------------------ */

const DEMO_TREE: TreeNode[] = [
  {
    name: 'src',
    type: 'folder',
    children: [
      {
        name: 'index.ts',
        type: 'file',
      },
      {
        name: 'app',
        type: 'folder',
        children: [
          { name: 'App.tsx', type: 'file' },
          { name: 'main.ts', type: 'file' },
        ],
      },
      {
        name: 'components',
        type: 'folder',
        children: [
          { name: 'Header.tsx', type: 'file' },
          { name: 'Sidebar.tsx', type: 'file' },
          { name: 'Footer.tsx', type: 'file' },
        ],
      },
      {
        name: 'utils',
        type: 'folder',
        children: [
          { name: 'helpers.ts', type: 'file' },
          { name: 'api.ts', type: 'file' },
        ],
      },
      {
        name: 'styles',
        type: 'folder',
        children: [
          { name: 'globals.css', type: 'file' },
          { name: 'theme.css', type: 'file' },
        ],
      },
    ],
  },
  {
    name: 'package.json',
    type: 'file',
  },
  {
    name: 'tsconfig.json',
    type: 'file',
  },
  {
    name: 'README.md',
    type: 'file',
  },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'ts':
    case 'tsx':
    case 'js':
    case 'jsx':
      return <FileCode2 size={14} className="text-blue-400 shrink-0" />;
    case 'json':
      return <FileJson size={14} className="text-yellow-400 shrink-0" />;
    case 'css':
      return <FileType size={14} className="text-purple-400 shrink-0" />;
    case 'md':
      return <FileText size={14} className="text-zinc-400 shrink-0" />;
    default:
      return <FileText size={14} className="text-zinc-500 shrink-0" />;
  }
}

/* ------------------------------------------------------------------ */
/*  TreeRow                                                            */
/* ------------------------------------------------------------------ */

interface TreeRowProps {
  node: TreeNode;
  depth: number;
  path: string;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onFileClick: (path: string) => void;
}

function TreeRow({ node, depth, path, expanded, onToggle, onFileClick }: TreeRowProps) {
  const isOpen = expanded.has(path);

  const handleClick = useCallback(() => {
    if (node.type === 'folder') {
      onToggle(path);
    } else {
      onFileClick(path);
    }
  }, [node.type, onToggle, onFileClick, path]);

  return (
    <div>
      <button
        onClick={handleClick}
        className="w-full flex items-center gap-1 px-2 py-[3px] text-left text-[13px] hover:bg-zinc-800/70 text-zinc-300 transition-colors duration-100 group"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {/* Chevron */}
        {node.type === 'folder' ? (
          isOpen ? (
            <ChevronDown size={14} className="shrink-0 text-zinc-500" />
          ) : (
            <ChevronRight size={14} className="shrink-0 text-zinc-500" />
          )
        ) : (
          <span className="w-[14px] shrink-0" />
        )}

        {/* Icon */}
        {node.type === 'folder' ? (
          isOpen ? (
            <FolderOpen size={14} className="text-amber-400 shrink-0" />
          ) : (
            <Folder size={14} className="text-amber-400 shrink-0" />
          )
        ) : (
          getFileIcon(node.name)
        )}

        {/* Name */}
        <span className="truncate">{node.name}</span>
      </button>

      {/* Children */}
      {node.type === 'folder' && isOpen && node.children && (
        <div>
          {node.children.map((child) => (
            <TreeRow
              key={child.name}
              node={child}
              depth={depth + 1}
              path={`${path}/${child.name}`}
              expanded={expanded}
              onToggle={onToggle}
              onFileClick={onFileClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  FileTree component                                                 */
/* ------------------------------------------------------------------ */

export function FileTree({ tree, onFileClick, connected = false }: FileTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['src']));

  const handleToggle = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const nodes = tree ?? DEMO_TREE;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-zinc-800">
        {connected ? (
          <FolderCog size={14} className="text-amber-400" />
        ) : (
          <Server size={14} className="text-zinc-500" />
        )}
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex-1">
          Explorer
        </span>
      </div>

      {/* Connect notice */}
      {!connected && (
        <div className="mx-3 mt-2 px-3 py-2 rounded-md bg-zinc-900/80 border border-zinc-800 text-[11px] text-zinc-500 leading-relaxed">
          <span className="text-zinc-400 font-medium">Demo mode.</span>{' '}
          Connect to a server to browse real files.
        </div>
      )}

      {/* Tree */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-1">
        {nodes.map((node) => (
          <TreeRow
            key={node.name}
            node={node}
            depth={0}
            path={node.name}
            expanded={expanded}
            onToggle={handleToggle}
            onFileClick={onFileClick ?? (() => {})}
          />
        ))}
      </div>
    </div>
  );
}
