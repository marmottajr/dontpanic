import type { Meta, StoryObj } from '@storybook/nextjs';
import { Button } from './button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from './card';

const meta = {
  title: 'UI/Card',
  component: Card,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>Improbability Drive</CardTitle>
        <CardDescription>Status of the onboard infinite improbability core.</CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Brain the size of a planet, and they ask me to render a card.
      </CardContent>
      <CardFooter className="gap-2">
        <Button size="sm">Engage</Button>
        <Button size="sm" variant="ghost">
          Cancel
        </Button>
      </CardFooter>
    </Card>
  ),
};

export const HeaderOnly: Story = {
  render: () => (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>42</CardTitle>
        <CardDescription>The answer to life, the universe, and everything.</CardDescription>
      </CardHeader>
    </Card>
  ),
};
