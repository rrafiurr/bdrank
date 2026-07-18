import { Layout } from "@/components/Layout";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { RulesTab } from "./rewards/RulesTab";
import { LevelsTab } from "./rewards/LevelsTab";
import { CatalogTab } from "./rewards/CatalogTab";
import { RedemptionsTab } from "./rewards/RedemptionsTab";
import { CampaignsTab } from "./rewards/CampaignsTab";

export default function Rewards() {
  return (
    <Layout title="Rewards">
      <Tabs defaultValue="rules">
        <TabsList>
          <TabsTrigger value="rules">Rules</TabsTrigger>
          <TabsTrigger value="levels">Levels</TabsTrigger>
          <TabsTrigger value="catalog">Catalog</TabsTrigger>
          <TabsTrigger value="redemptions">Redemptions</TabsTrigger>
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
        </TabsList>
        <TabsContent value="rules"><RulesTab /></TabsContent>
        <TabsContent value="levels"><LevelsTab /></TabsContent>
        <TabsContent value="catalog"><CatalogTab /></TabsContent>
        <TabsContent value="redemptions"><RedemptionsTab /></TabsContent>
        <TabsContent value="campaigns"><CampaignsTab /></TabsContent>
      </Tabs>
    </Layout>
  );
}
