import React from 'react';
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

const HourLinesEditor = ({ lines = [], onChange, profiles = [] }) => {
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
        <Label className="text-sm font-semibold">Lignes d&apos;heures</Label>
        <Button type="button" variant="outline" size="sm" onClick={addLine}>
          <Plus className="h-4 w-4 mr-1" /> Jour / service
        </Button>
      </div>

      {lines.length === 0 && (
        <p className="text-sm text-muted-foreground">Aucune heure. Ajoutez un jour de chantier.</p>
      )}

      <div className="space-y-4">
        {lines.map((line, idx) => (
          <div
            key={idx}
            className="rounded-xl border border-gray-100 dark:border-gray-800 p-3 space-y-3 bg-gray-50/50 dark:bg-gray-900/40"
          >
            <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
              <div className="md:col-span-4">
                <Label className="text-xs">Date</Label>
                <Input
                  type="date"
                  value={line.work_date || ''}
                  onChange={(e) => updateLine(idx, { work_date: e.target.value })}
                />
              </div>
              <div className="md:col-span-6">
                <Label className="text-xs">Service (atome mix)</Label>
                <Select
                  value={line.service || 'autre'}
                  onValueChange={(v) => updateLine(idx, { service: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SERVICE_CODES.map((s) => (
                      <SelectItem key={s.code} value={s.code}>
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
                    <Label className="text-xs">Équipier</Label>
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
                        <SelectValue placeholder="Choisir…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__manual__">Saisie manuelle</SelectItem>
                        {profiles.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.full_name || p.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-3">
                    <Label className="text-xs">Nom</Label>
                    <Input
                      value={person.name || ''}
                      onChange={(e) => updatePerson(idx, pIdx, { name: e.target.value })}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-xs">Heures</Label>
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
                    <Label className="text-xs">Adresse domicile</Label>
                    <AddressSearchInput
                      defaultValue={person.homeAddress || ''}
                      placeholder="Adresse…"
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
                <UserPlus className="h-4 w-4 mr-1" /> Ajouter une personne
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default HourLinesEditor;
