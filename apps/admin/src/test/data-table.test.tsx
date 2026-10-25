import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n/i18n-provider';
import { type Column, DataTable } from '@/ui/data-table';

interface Row {
  id: string;
  name: string;
  age: number;
}

const rows: Row[] = [
  { id: 'a', name: 'Karim', age: 40 },
  { id: 'b', name: 'Amina', age: 31 },
];
const columns: Column<Row>[] = [
  { id: 'name', header: 'Nom', cell: (row) => row.name, sortValue: (row) => row.name },
  { id: 'age', header: 'Âge', cell: (row) => row.age, align: 'end', hideable: true },
];

function renderTable(onOpen = vi.fn()) {
  render(
    <I18nProvider initialLocale="fr">
      <DataTable
        label="Personnes"
        columns={columns}
        rows={rows}
        rowId={(row) => row.id}
        onOpen={onOpen}
      />
    </I18nProvider>,
  );
  return onOpen;
}

const names = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[0]?.textContent);

afterEach(cleanup);

describe('DataTable', () => {
  it('sorts by a sortable column and says so', () => {
    renderTable();
    expect(names()).toEqual(['Karim', 'Amina']);
    fireEvent.click(screen.getByRole('button', { name: 'Nom' }));
    expect(names()).toEqual(['Amina', 'Karim']);
    expect(screen.getByRole('columnheader', { name: 'Nom' }).getAttribute('aria-sort')).toBe(
      'ascending',
    );
  });

  it('opens a record by click or keyboard', () => {
    const onOpen = renderTable();
    fireEvent.click(screen.getByText('Karim'));
    expect(onOpen).toHaveBeenLastCalledWith(rows[0]);
    fireEvent.keyDown(screen.getByText('Amina').closest('tr')!, { key: 'Enter' });
    expect(onOpen).toHaveBeenLastCalledWith(rows[1]);
  });

  it('lets a button inside a row act alone, without opening the row', () => {
    const onOpen = vi.fn();
    const onAction = vi.fn();
    render(
      <I18nProvider initialLocale="fr">
        <DataTable
          label="Personnes"
          columns={[
            ...columns,
            {
              id: 'action',
              header: 'Action',
              cell: (row) => (
                <button type="button" onClick={() => onAction(row.id)}>
                  Traiter {row.name}
                </button>
              ),
            },
          ]}
          rows={rows}
          rowId={(row) => row.id}
          onOpen={onOpen}
        />
      </I18nProvider>,
    );
    const button = screen.getByRole('button', { name: 'Traiter Karim' });
    fireEvent.click(button);
    fireEvent.keyDown(button, { key: 'Enter' });
    expect(onAction).toHaveBeenCalledWith('a');
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('shows the empty state without rows', () => {
    render(
      <I18nProvider initialLocale="en">
        <DataTable label="People" columns={columns} rows={[]} rowId={(row) => row.id} />
      </I18nProvider>,
    );
    expect(screen.getByText('No items')).toBeTruthy();
  });
});
