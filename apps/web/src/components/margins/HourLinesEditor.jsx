import React from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import AddressSearchInput from '@/components/ui/AddressSearchInput';
import { SERVICE_CODES } from '@/lib/margin/constants';
import { todayISODate } from '@/lib/timeTracking';

const emptyPerson = () => ({ name: '', hours: '', homeAddress: '', profileId: null });
const emptyLine = () => ({
  work_date: todayISODate(),
  service: 'nettoyage',
  people: [emptyPerson()],
});

function serviceChoices(services) {
  if (Array.isArray(services) && services.length) {
    return services.map((s) => ({
      value: s.value || s.code,
      code: s.code || s.value,
      label: s.label || s.code || s.value,
    }));
  }
  return SERVICE_CODES.map((s) => ({ value: s.code, code: s.code, label: s.label }));
}

function lineSelectValue(line, options) {
  const values = new Set(options.map((s) => s.value));
  if (line?.serviceValue && values.has(line.serviceValue)) return line.serviceValue;
  if (line?.serviceLabel) {
    const byLabel = options.find((s) => s.label === line.serviceLabel);
    if (byLabel) return byLabel.value;
  }
  const byCode = options.find((s) => s.value === line?.service || s.code === line?.service);
  if (byCode) return byCode.value;
  return line?.service || options[0]?.value || 'autre';
}

const HourLinesEditor = ({ lines = [], onChange, profiles = [], services = null }) => {
  const { t } = useTranslation();
  const options = serviceChoices(services);

  const updateLine = (index, patch) => {
    onChange(lines.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  };

  const updatePerson = (lineIdx, personIdx, patch) => {
    const line = lines[lineIdx];
    const people = (line.people || []).map((p, i) => (i === personIdx ? { ...p, ...patch } : p));
    updateLine(lineIdx, { people });
  };

  const addLine = () => onChange([...lines, emptyLine()]);
  const removeLine = (index) => onChange(lines.filter((_, i) => i !== index));

  const addPerson = (lineIdx) => {
    const line = lines[lineIdx];
    updateLine(lineIdx, { people: [...(line.people || []), emptyPerson()] });
  };

  const removePerson = (lineIdx, personIdx) => {
    const line = lines[lineIdx];
    const people = (line.people || []).filter((_, i) => i !== personIdx);
    updateLine(lineIdx, { people: people.length ? people : [emptyPerson()] });
  };

  const applyProfile = (lineIdx, personIdx, profileId) => {
    const profile = profiles.find((p) => p.id === profileId);
    if (!profile) {
      updatePerson(lineIdx, personIdx, { profileId: null });
      return;
    }
    updatePerson(lineIdx, personIdx, {
      profileId: profile.id,
      name: profile.full_name || profile.email || '',
      homeAddress: profile.address || '',
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">{t('margins.hourLines.title')}</Label>
        <Button type="button" variant="outline" size="sm" onClick={addLine}>
          <Plus className="h-4 w-4 mr-1" /> {t('margins.hourLines.addDay')}
        </Button>
      </div>

      {lines.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('margins.hourLines.empty')}</p>
      )}

      <div className="space-y-4">
        {lines.map((line, idx) => (
          <div
            key={idx}
            className="rounded-xl border border-gray-100 dark:border-gray-800 p-3 space-y-3 bg-gray-50/50 dark:bg-gray-900/40"
          >
            <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
              <div className="md:col-span-4">
                <Label className="text-xs">{t('margins.hourLines.date')}</Label>
                <Input
                  type="date"
                  value={line.work_date || ''}
                  onChange={(e) => updateLine(idx, { work_date: e.target.value })}
                />
              </div>
              <div className="md:col-span-6">
                <Label className="text-xs">{t('margins.hourLines.service')}</Label>
                <Select
                  value={lineSelectValue(line, options)}
                  onValueChange={(v) => {
                    const opt = options.find((s) => s.value === v);
                    updateLine(idx, {
                      service: opt?.code || v,
                      serviceLabel: opt?.label || v,
                      serviceValue: v,
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2 flex justify-end">
                <Button type="button" variant="ghost" size="icon" onClick={() => removeLine(idx)}>
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              {(line.people || []).map((person, pIdx) => (
                <div
                  key={pIdx}
                  className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end rounded-lg bg-white dark:bg-gray-950 p-2 border border-gray-100 dark:border-gray-800"
                >
                  <div className="md:col-span-3">
                    <Label className="text-xs">{t('margins.hourLines.person')}</Label>
                    <Select
                      value={person.profileId || '__manual__'}
                      onValueChange={(v) => {
                        if (v === '__manual__') {
                          updatePerson(idx, pIdx, { profileId: null });
                        } else {
                          applyProfile(idx, pIdx, v);
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('margins.hourLines.choose')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__manual__">{t('margins.hourLines.manual')}</SelectItem>
                        {profiles.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.full_name || p.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-3">
                    <Label className="text-xs">{t('margins.hourLines.name')}</Label>
                    <Input
                      value={person.name || ''}
                      onChange={(e) => updatePerson(idx, pIdx, { name: e.target.value })}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-xs">{t('margins.hourLines.hours')}</Label>
                    <Input
                      type="number"
                      step="0.25"
                      min="0"
                      value={person.hours ?? ''}
                      onChange={(e) =>
                        updatePerson(idx, pIdx, {
                          hours: e.target.value === '' ? '' : Number(e.target.value),
                        })
                      }
                    />
                  </div>
                  <div className="md:col-span-3">
                    <Label className="text-xs">{t('margins.hourLines.home')}</Label>
                    <AddressSearchInput
                      defaultValue={person.homeAddress || ''}
                      placeholder={t('margins.hourLines.homePh')}
                      onInputChange={(v) => updatePerson(idx, pIdx, { homeAddress: v })}
                      onSelect={(item) =>
                        updatePerson(idx, pIdx, {
                          homeAddress: item.display_name || item.formattedAddress || '',
                        })
                      }
                    />
                  </div>
                  <div className="md:col-span-1 flex justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removePerson(idx, pIdx)}
                    >
                      <Trash2 className="h-4 w-4 text-gray-400" />
                    </Button>
                  </div>
                </div>
              ))}
              <Button type="button" variant="ghost" size="sm" onClick={() => addPerson(idx)}>
                <UserPlus className="h-4 w-4 mr-1" /> {t('margins.hourLines.addPerson')}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default HourLinesEditor;
