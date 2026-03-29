import { useState, useRef } from "react";
import { Form, useNavigation } from "@remix-run/react";
import { Card, Badge, Button } from "~/components/admin/ui";
import { SUBCATEGORIES, INS_SERIES } from "./admin";

export default function AdminContracts() {
  const navigation = useNavigation();

  const [insCategory, setInsCategory] = useState('life');
  const [insSubcategory, setInsSubcategory] = useState('');
  const [insCount, setInsCount] = useState(6);
  const [insStartOffset, setInsStartOffset] = useState(30);
  const [insSpacingDays, setInsSpacingDays] = useState(30);
  const [insCustomName, setInsCustomName] = useState('');

  // Delete state
  const [delCategory, setDelCategory] = useState('life');
  const [delCondition, setDelCondition] = useState('');
  const [delConfirmed, setDelConfirmed] = useState(false);

  const isCreating = navigation.state === 'submitting' && navigation.formData?.get('action') === 'bulk-create-insurance';
  const isDeleting = navigation.state === 'submitting' && navigation.formData?.get('action') === 'delete-insurance-group';

  const prevDeleting = useRef(false);
  if (isDeleting) prevDeleting.current = true;
  else if (prevDeleting.current) { prevDeleting.current = false; setDelConfirmed(false); }

  const handleCategory = (cat: string) => {
    setInsCategory(cat);
    setInsSubcategory('');
    setInsCustomName('');
  };

  const handleSubcategory = (subSlug: string) => {
    setInsSubcategory(subSlug);
    const sub = SUBCATEGORIES[insCategory]?.find(s => s.slug === subSlug);
    if (sub) setInsCustomName(sub.template);
    else if (!subSlug) setInsCustomName('');
  };

  const insSeries = INS_SERIES[insCategory]?.series ?? insCategory;

  const previewContracts = Array.from({ length: Math.min(insCount, 12) }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + insStartOffset + i * insSpacingDays);
    const shortDate = d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
    const longDate = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const idx = String(i + 1).padStart(2, '0');
    let displayName: string;
    if (insCustomName.trim()) {
      const resolved = insCustomName.trim().replace(/\{date\}/gi, shortDate);
      displayName = `${resolved} [#${idx}]`;
    } else {
      displayName = `${insSeries} · ${shortDate} [#${idx}]`;
    }
    return { name: displayName, maturity: longDate };
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-admin-text">Contract Factory</h1>
        <p className="text-sm text-admin-text-dim mt-1">Bulk create and manage insurance contract series</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Step 1: Category */}
        <Card title="1. Choose Category" subtitle="Select insurance category">
          <div className="space-y-2">
            {Object.entries(INS_SERIES).map(([key, info]) => (
              <button
                key={key}
                onClick={() => handleCategory(key)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-sm text-left transition-colors ${
                  insCategory === key
                    ? 'bg-blue-500/10 border-blue-500/40 text-blue-400'
                    : 'bg-admin-surface-2 border-admin-border text-admin-text hover:border-blue-500/20'
                }`}
              >
                <span className="text-lg">{info.icon}</span>
                <div>
                  <div className="font-medium">{info.label}</div>
                  <div className="text-xs text-admin-text-dim">{info.series}</div>
                </div>
              </button>
            ))}
          </div>
        </Card>

        {/* Step 2: Configuration */}
        <Card title="2. Configure Series" subtitle="Set parameters and subcategory">
          <Form method="post" className="space-y-4">
            <input type="hidden" name="action" value="bulk-create-insurance" />
            <input type="hidden" name="insCategory" value={insSubcategory || insCategory} />
            <input type="hidden" name="insCustomName" value={insCustomName} />

            {/* Subcategory */}
            <div>
              <label className="block text-xs font-medium text-admin-text-dim mb-1.5">Subcategory (optional)</label>
              <select
                value={insSubcategory}
                onChange={e => handleSubcategory(e.target.value)}
                className="w-full bg-admin-surface-2 border border-admin-border rounded-lg px-3 py-2 text-sm text-admin-text"
              >
                <option value="">— General {INS_SERIES[insCategory]?.label} —</option>
                {(SUBCATEGORIES[insCategory] || []).map(sub => (
                  <option key={sub.slug} value={sub.slug}>{sub.label}</option>
                ))}
              </select>
            </div>

            {/* Custom name template */}
            <div>
              <label className="block text-xs font-medium text-admin-text-dim mb-1.5">Name Template</label>
              <input
                type="text"
                value={insCustomName}
                onChange={e => setInsCustomName(e.target.value)}
                placeholder={`${insSeries} · {date} [#01]`}
                className="w-full bg-admin-surface-2 border border-admin-border rounded-lg px-3 py-2 text-sm text-admin-text placeholder:text-admin-text-dim"
              />
              <p className="text-[10px] text-admin-text-dim mt-1">Use {'{date}'} for auto maturity date</p>
            </div>

            {/* Parameters */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-admin-text-dim mb-1">Count</label>
                <input
                  type="number" name="insCount" min="1" max="24" value={insCount}
                  onChange={e => setInsCount(Number(e.target.value))}
                  className="w-full bg-admin-surface-2 border border-admin-border rounded-lg px-3 py-2 text-sm text-admin-text font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-admin-text-dim mb-1">Start (days)</label>
                <input
                  type="number" name="insStartOffset" min="1" max="365" value={insStartOffset}
                  onChange={e => setInsStartOffset(Number(e.target.value))}
                  className="w-full bg-admin-surface-2 border border-admin-border rounded-lg px-3 py-2 text-sm text-admin-text font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-admin-text-dim mb-1">Spacing</label>
                <input
                  type="number" name="insSpacingDays" min="1" max="365" value={insSpacingDays}
                  onChange={e => setInsSpacingDays(Number(e.target.value))}
                  className="w-full bg-admin-surface-2 border border-admin-border rounded-lg px-3 py-2 text-sm text-admin-text font-mono"
                />
              </div>
            </div>

            <Button type="submit" variant="primary" className="w-full" disabled={isCreating}>
              {isCreating ? '⏳ Creating...' : `🏭 Create ${insCount} Contracts`}
            </Button>
          </Form>

          {/* Delete Section */}
          <div className="mt-6 pt-4 border-t border-admin-border">
            <h4 className="text-sm font-medium text-red-400 mb-3">🗑️ Delete Contract Group</h4>
            <Form method="post" className="space-y-3">
              <input type="hidden" name="action" value="delete-insurance-group" />

              <div>
                <label className="block text-xs font-medium text-admin-text-dim mb-1">Category</label>
                <select
                  name="delCategory"
                  value={delCategory}
                  onChange={e => { setDelCategory(e.target.value); setDelConfirmed(false); }}
                  className="w-full bg-admin-surface-2 border border-admin-border rounded-lg px-3 py-2 text-sm text-admin-text"
                >
                  {Object.entries(INS_SERIES).map(([key, info]) => (
                    <option key={key} value={key}>{info.icon} {info.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-admin-text-dim mb-1">Condition (optional)</label>
                <input
                  type="text" name="delCondition" value={delCondition}
                  onChange={e => { setDelCondition(e.target.value); setDelConfirmed(false); }}
                  placeholder="Leave empty to delete all"
                  className="w-full bg-admin-surface-2 border border-admin-border rounded-lg px-3 py-2 text-sm text-admin-text placeholder:text-admin-text-dim"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox" id="delConfirm" checked={delConfirmed}
                  onChange={e => setDelConfirmed(e.target.checked)}
                  className="w-4 h-4 accent-red-500"
                />
                <label htmlFor="delConfirm" className="text-xs text-red-400">
                  I confirm deletion of {delCondition ? `"${delCondition}" in ` : 'all '}{INS_SERIES[delCategory]?.label}
                </label>
              </div>

              <Button type="submit" variant="danger" className="w-full" disabled={!delConfirmed || isDeleting}>
                {isDeleting ? '⏳ Deleting...' : '🗑️ Delete Group'}
              </Button>
            </Form>
          </div>
        </Card>

        {/* Step 3: Preview */}
        <Card title="3. Preview Contracts" subtitle={`${insCount} contracts in series`}>
          <div className="space-y-2 max-h-96 overflow-y-auto admin-scrollbar">
            {previewContracts.map((contract, i) => (
              <div key={i} className="flex items-start gap-3 p-2.5 rounded-lg bg-admin-surface-2 border border-admin-border">
                <span className="text-lg mt-0.5">{INS_SERIES[insCategory]?.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-admin-text leading-snug">{contract.name}</div>
                  <div className="text-xs text-admin-text-dim mt-0.5">Maturity: {contract.maturity}</div>
                </div>
                <Badge variant="amber">Pending</Badge>
              </div>
            ))}
            {insCount > 12 && (
              <div className="text-center text-xs text-admin-text-dim py-2">
                ... and {insCount - 12} more contracts
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-admin-border">
            <div className="grid grid-cols-2 gap-3 text-center">
              <div>
                <div className="text-lg font-bold text-admin-text">{insCount}</div>
                <div className="text-xs text-admin-text-dim">Total Contracts</div>
              </div>
              <div>
                <div className="text-lg font-bold text-admin-text">{insCount * insSpacingDays}</div>
                <div className="text-xs text-admin-text-dim">Days Covered</div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
