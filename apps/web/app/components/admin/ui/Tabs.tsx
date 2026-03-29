import React, { useState } from 'react';

interface Tab {
  id: string;
  label: string;
  count?: number;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (id: string) => void;
}

export function Tabs({ tabs, activeTab, onTabChange }: TabsProps) {
  return (
    <div className="flex items-center gap-0 border-b border-admin-border overflow-x-auto">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors relative
            ${activeTab === tab.id
              ? 'text-admin-text admin-tab-active'
              : 'text-admin-text-dim hover:text-admin-text-muted'
            }`}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
              activeTab === tab.id
                ? 'bg-blue-500/15 text-blue-400'
                : 'bg-admin-surface-2 text-admin-text-dim'
            }`}>
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
