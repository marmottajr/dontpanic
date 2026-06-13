import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './tabs';

function Fixture() {
  return (
    <Tabs defaultValue="general">
      <TabsList>
        <TabsTrigger value="general">General</TabsTrigger>
        <TabsTrigger value="security">Security</TabsTrigger>
      </TabsList>
      <TabsContent value="general">General panel</TabsContent>
      <TabsContent value="security">Security panel</TabsContent>
    </Tabs>
  );
}

describe('Tabs', () => {
  it('shows the default panel and hides the others', () => {
    render(<Fixture />);
    expect(screen.getByText('General panel')).toBeInTheDocument();
    expect(screen.queryByText('Security panel')).not.toBeInTheDocument();

    const generalTab = screen.getByRole('tab', { name: 'General' });
    expect(generalTab).toHaveAttribute('aria-selected', 'true');
  });

  it('switches the visible panel when another tab is selected', async () => {
    const user = userEvent.setup();
    render(<Fixture />);

    await user.click(screen.getByRole('tab', { name: 'Security' }));

    expect(screen.getByText('Security panel')).toBeInTheDocument();
    expect(screen.queryByText('General panel')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Security' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: 'General' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });
});
