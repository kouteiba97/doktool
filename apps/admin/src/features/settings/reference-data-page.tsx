'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { api, call, type Schemas } from '@/api/client';
import { useI18n } from '@/i18n/i18n-provider';
import { Button } from '@/ui/button';
import { type Column, DataTable } from '@/ui/data-table';
import { useErrorText } from '@/ui/errors';
import { EmptyState, PageHeader } from '@/ui/feedback';
import { Field, TextInput } from '@/ui/field';
import { ReasonDialog } from '@/ui/reason-dialog';
import { Tab, TabList, TabPanel, Tabs } from '@/ui/tabs';
import { useToast } from '@/ui/toast';
import { ReviewPolicies } from './review-policies';

type Specialty = Schemas['SpecialtyDto'];
type Place = Schemas['PlaceDto'];
type PlaceKind = 'institutions' | 'universities';

const referenceKey = (kind: string) => ['admin', 'reference-data', kind] as const;

/** Wilaya codes as the API accepts them. */
const WILAYA_PATTERN = /^\d{1,3}$/;
const SPECIALTY_CODE = /^[A-Z][A-Z0-9_]{1,39}$/;

/**
 * « Paramètres système » — reference data of the onboarding and verification pickers: specialties,
 * institutions (by wilaya) and universities, added with a reason, never typed by users — and the
 * clinical review rule (ADR-024).
 */
export function ReferenceDataPage() {
  const { t } = useI18n();
  return (
    <>
      <PageHeader title={t('admin.settings.title')} caption={t('admin.settings.caption')} />
      <Tabs defaultValue="specialties" className="dt-stack">
        <TabList label={t('admin.settings.title')}>
          <Tab value="specialties">{t('admin.settings.specialties')}</Tab>
          <Tab value="institutions">{t('admin.settings.institutions')}</Tab>
          <Tab value="universities">{t('admin.settings.universities')}</Tab>
          <Tab value="review">{t('admin.settings.review')}</Tab>
        </TabList>
        <TabPanel value="specialties">
          <Specialties />
        </TabPanel>
        <TabPanel value="institutions">
          <Places kind="institutions" />
        </TabPanel>
        <TabPanel value="universities">
          <Places kind="universities" />
        </TabPanel>
        <TabPanel value="review">
          <ReviewPolicies />
        </TabPanel>
      </Tabs>
    </>
  );
}

function Specialties() {
  const { t, locale } = useI18n();
  const errorText = useErrorText();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [code, setCode] = useState('');
  const [nameFr, setNameFr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const list = useQuery({
    queryKey: referenceKey('specialties'),
    queryFn: () => call(api.GET('/admin/v1/reference-data/specialties')),
  });
  const columns = useMemo<Column<Specialty>[]>(
    () => [
      {
        id: 'code',
        header: t('admin.settings.code'),
        cell: (row) => <span className="dt-mono">{row.code}</span>,
        sortValue: (row) => row.code,
      },
      {
        id: 'fr',
        header: t('admin.settings.nameFr'),
        cell: (row) => row.nameFr,
        sortValue: (row) => row.nameFr.toLocaleLowerCase(locale),
      },
      {
        id: 'en',
        header: t('admin.settings.nameEn'),
        cell: (row) => row.nameEn,
        sortValue: (row) => row.nameEn.toLocaleLowerCase(locale),
      },
    ],
    [t, locale],
  );
  const ready = SPECIALTY_CODE.test(code.trim()) && nameFr.trim() !== '' && nameEn.trim() !== '';

  if (list.isError) {
    return (
      <EmptyState icon={CircleAlert} error title={t('admin.errors.loadFailed')}>
        {errorText(list.error)}
      </EmptyState>
    );
  }
  return (
    <>
      <DataTable
        label={t('admin.settings.specialties')}
        columns={columns}
        rows={list.data ?? []}
        rowId={(row) => row.id}
        loading={list.isPending}
        toolbar={
          <Button
            size="sm"
            onClick={() => {
              setCode('');
              setNameFr('');
              setNameEn('');
              setAdding(true);
            }}
          >
            <Plus size={14} aria-hidden />
            {t('admin.settings.addSpecialty')}
          </Button>
        }
      />
      <ReasonDialog
        open={adding}
        onOpenChange={setAdding}
        title={t('admin.settings.addSpecialty')}
        confirmLabel={t('admin.settings.add')}
        ready={ready}
        onConfirm={async (reason) => {
          await call(
            api.POST('/admin/v1/reference-data/specialties', {
              body: { code: code.trim(), nameFr: nameFr.trim(), nameEn: nameEn.trim(), reason },
            }),
          );
          await queryClient.invalidateQueries({ queryKey: referenceKey('specialties') });
          toast(t('admin.settings.added'));
        }}
      >
        <Field label={t('admin.settings.code')} required help={t('admin.settings.codeHelp')}>
          {({ inputId, describedBy }) => (
            <TextInput
              id={inputId}
              aria-describedby={describedBy}
              mono
              maxLength={40}
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
            />
          )}
        </Field>
        <Field label={t('admin.settings.nameFr')} required>
          {({ inputId }) => (
            <TextInput
              id={inputId}
              maxLength={120}
              value={nameFr}
              onChange={(event) => setNameFr(event.target.value)}
            />
          )}
        </Field>
        <Field label={t('admin.settings.nameEn')} required>
          {({ inputId }) => (
            <TextInput
              id={inputId}
              maxLength={120}
              value={nameEn}
              onChange={(event) => setNameEn(event.target.value)}
            />
          )}
        </Field>
      </ReasonDialog>
    </>
  );
}

function Places({ kind }: { kind: PlaceKind }) {
  const { t, locale } = useI18n();
  const errorText = useErrorText();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [wilaya, setWilaya] = useState('');
  const path =
    kind === 'institutions'
      ? '/admin/v1/reference-data/institutions'
      : '/admin/v1/reference-data/universities';
  const list = useQuery({ queryKey: referenceKey(kind), queryFn: () => call(api.GET(path)) });
  const columns = useMemo<Column<Place>[]>(
    () => [
      {
        id: 'name',
        header: t('admin.settings.name'),
        cell: (row) => row.name,
        sortValue: (row) => row.name.toLocaleLowerCase(locale),
      },
      {
        id: 'wilaya',
        header: t('admin.settings.wilaya'),
        align: 'end',
        cell: (row) => String(row.wilayaCode).padStart(2, '0'),
        sortValue: (row) => row.wilayaCode,
      },
    ],
    [t, locale],
  );
  const wilayaCode = Number(wilaya);
  const ready = name.trim().length >= 2 && WILAYA_PATTERN.test(wilaya.trim()) && wilayaCode >= 1;
  const label =
    kind === 'institutions'
      ? t('admin.settings.addInstitution')
      : t('admin.settings.addUniversity');

  if (list.isError) {
    return (
      <EmptyState icon={CircleAlert} error title={t('admin.errors.loadFailed')}>
        {errorText(list.error)}
      </EmptyState>
    );
  }
  return (
    <>
      <DataTable
        label={
          kind === 'institutions'
            ? t('admin.settings.institutions')
            : t('admin.settings.universities')
        }
        columns={columns}
        rows={list.data ?? []}
        rowId={(row) => row.id}
        loading={list.isPending}
        toolbar={
          <Button
            size="sm"
            onClick={() => {
              setName('');
              setWilaya('');
              setAdding(true);
            }}
          >
            <Plus size={14} aria-hidden />
            {label}
          </Button>
        }
      />
      <ReasonDialog
        open={adding}
        onOpenChange={setAdding}
        title={label}
        confirmLabel={t('admin.settings.add')}
        ready={ready}
        onConfirm={async (reason) => {
          await call(api.POST(path, { body: { name: name.trim(), wilayaCode, reason } }));
          await queryClient.invalidateQueries({ queryKey: referenceKey(kind) });
          toast(t('admin.settings.added'));
        }}
      >
        <Field label={t('admin.settings.name')} required>
          {({ inputId }) => (
            <TextInput
              id={inputId}
              maxLength={200}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </Field>
        <Field label={t('admin.settings.wilaya')} required help={t('admin.settings.wilayaHelp')}>
          {({ inputId, describedBy }) => (
            <TextInput
              id={inputId}
              aria-describedby={describedBy}
              inputMode="numeric"
              maxLength={3}
              value={wilaya}
              onChange={(event) => setWilaya(event.target.value)}
            />
          )}
        </Field>
      </ReasonDialog>
    </>
  );
}
