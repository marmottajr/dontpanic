import type { Meta, StoryObj } from '@storybook/nextjs';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';

const meta = {
  title: 'UI/Tabs',
  component: Tabs,
  tags: ['autodocs'],
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The General/Security split used on the profile page. */
export const Default: Story = {
  render: () => (
    <Tabs defaultValue="general" className="w-80">
      <TabsList>
        <TabsTrigger value="general">General</TabsTrigger>
        <TabsTrigger value="security">Security</TabsTrigger>
      </TabsList>
      <TabsContent value="general">
        <p className="text-sm text-muted-foreground">Name, avatar, email — the usual.</p>
      </TabsContent>
      <TabsContent value="security">
        <p className="text-sm text-muted-foreground">Password, 2FA, active sessions.</p>
      </TabsContent>
    </Tabs>
  ),
};
