/**
 * /design: the design-system QA sheet. OWNER: Mansukh. Spec: docs/specs/05-mansukh-design.md §1.
 * Render every primitive from packages/ui here (Button, Card, Badge, Gauge, Meter, ScoreRing, …).
 */
import { Button } from "@onfloor/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@onfloor/ui/components/card";

export default function DesignPage() {
  return (
    <main className="mx-auto max-w-4xl space-y-8 p-8">
      <h1 className="text-2xl font-semibold">Design system</h1>
      <section className="flex gap-2">
        <Button>Primary</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="destructive">Destructive</Button>
      </section>
      <Card>
        <CardHeader>
          <CardTitle>Card</CardTitle>
        </CardHeader>
        <CardContent>TODO(mansukh): tokens, semantic colours, Gauge, Meter, ScoreRing, Sparkline.</CardContent>
      </Card>
    </main>
  );
}
