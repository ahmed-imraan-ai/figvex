import type { Template } from "./index";

// Cloud diagrams with the AWS, Azure, Google Cloud and Kubernetes icons in
// PlantUML's standard library. The icons load from the official PlantUML
// host the first time a diagram uses them. Use "Icons" above the editor to
// search them all and insert one.

export const cloudTemplates: Template[] = [
  {
    id: "cloud-aws-three-tier",
    engine: "plantuml",
    category: "Architecture & networks",
    title: "AWS three-tier web app",
    summary: "Users reach EC2 web servers through Route 53, CloudFront and a load balancer, with RDS and S3 behind.",
    code: `@startuml
' AWS icons from PlantUML's standard library. Each icon is a macro:
' Name(alias, "label", "technology"). Search them with "Icons" above.
!include <awslib14/AWSCommon>
!include <awslib14/General/Users>
!include <awslib14/NetworkingContentDelivery/Route53>
!include <awslib14/NetworkingContentDelivery/CloudFront>
!include <awslib14/NetworkingContentDelivery/ElasticLoadBalancingApplicationLoadBalancer>
!include <awslib14/Compute/EC2>
!include <awslib14/Database/RDS>
!include <awslib14/Storage/SimpleStorageService>
left to right direction

Users(users, "Visitors", "web browsers")
Route53(dns, "Route 53", "DNS")
CloudFront(cdn, "CloudFront", "CDN")
ElasticLoadBalancingApplicationLoadBalancer(alb, "Load balancer", "HTTPS")
rectangle "Auto Scaling group" {
  EC2(web1, "Web server 1", "t3.small")
  EC2(web2, "Web server 2", "t3.small")
}
RDS(db, "Database", "PostgreSQL, Multi-AZ")
SimpleStorageService(assets, "Static assets", "S3")

users --> dns
users --> cdn
cdn --> assets
cdn --> alb
alb --> web1
alb --> web2
web1 --> db
web2 --> db
@enduml
`,
  },
  {
    id: "cloud-aws-serverless",
    engine: "plantuml",
    category: "Architecture & networks",
    title: "AWS serverless API",
    summary: "API Gateway and Lambda, with Cognito sign-in, DynamoDB, an SQS queue and a worker function.",
    code: `@startuml
!include <awslib14/AWSCommon>
!include <awslib14/General/Client>
!include <awslib14/SecurityIdentityCompliance/Cognito>
!include <awslib14/ApplicationIntegration/APIGateway>
!include <awslib14/Compute/Lambda>
!include <awslib14/Database/DynamoDB>
!include <awslib14/ApplicationIntegration/SimpleQueueService>
!include <awslib14/ManagementGovernance/CloudWatch>
left to right direction

Client(app, "Mobile app", "iOS and Android")
Cognito(auth, "Sign-in", "Cognito user pool")
APIGateway(api, "REST API", "API Gateway")
Lambda(orders, "Orders", "Node.js")
DynamoDB(table, "Orders table", "DynamoDB")
SimpleQueueService(queue, "Order events", "SQS")
Lambda(worker, "Email worker", "Python")
CloudWatch(logs, "Logs and alarms", "CloudWatch")

app --> auth : sign in
app --> api : HTTPS + token
api --> orders
orders --> table
orders --> queue
queue --> worker
orders ..> logs
worker ..> logs
@enduml
`,
  },
  {
    id: "cloud-azure-web",
    engine: "plantuml",
    category: "Architecture & networks",
    title: "Azure web app",
    summary: "Front Door in front of App Service, with Azure AD sign-in, Cosmos DB, Key Vault and Blob storage.",
    code: `@startuml
!include <azure/AzureCommon>
!include <azure/Networking/AzureFrontDoor>
!include <azure/Compute/AzureAppService>
!include <azure/Compute/AzureFunction>
!include <azure/Identity/AzureActiveDirectory>
!include <azure/Databases/AzureCosmosDb>
!include <azure/Security/AzureKeyVault>
!include <azure/Storage/AzureBlobStorage>
left to right direction

actor "Student" as user
AzureFrontDoor(edge, "Front Door", "global entry point")
AzureActiveDirectory(aad, "Azure AD", "sign-in")
AzureAppService(web, "Web app", "App Service")
AzureFunction(jobs, "Background jobs", "Functions")
AzureCosmosDb(db, "Course data", "Cosmos DB")
AzureKeyVault(secrets, "Secrets", "Key Vault")
AzureBlobStorage(files, "Uploads", "Blob storage")

user --> edge
user --> aad
edge --> web
web --> db
web --> files
web ..> secrets
files --> jobs : new upload
jobs --> db
@enduml
`,
  },
  {
    id: "cloud-gcp-pipeline",
    engine: "plantuml",
    category: "Architecture & networks",
    title: "Google Cloud data pipeline",
    summary: "Uploads to Cloud Storage trigger a function; Pub/Sub and Dataflow load the data into BigQuery.",
    code: `@startuml
!include <gcp/GCPCommon>
!include <gcp/Storage/Cloud_Storage>
!include <gcp/Compute/Cloud_Functions>
!include <gcp/Data_Analytics/Cloud_PubSub>
!include <gcp/Data_Analytics/Cloud_Dataflow>
!include <gcp/Data_Analytics/BigQuery>
!include <gcp/Compute/Cloud_Run>
left to right direction

Cloud_Storage(raw, "Raw files", "CSV uploads")
Cloud_Functions(check, "Validate", "Cloud Functions")
Cloud_PubSub(events, "Events", "Pub/Sub")
Cloud_Dataflow(etl, "Transform", "Dataflow")
BigQuery(warehouse, "Warehouse", "BigQuery")
Cloud_Run(dash, "Dashboard", "Cloud Run")

raw --> check : object finalised
check --> events
events --> etl
etl --> warehouse
dash --> warehouse : SQL
@enduml
`,
  },
  {
    id: "cloud-k8s",
    engine: "plantuml",
    category: "Architecture & networks",
    title: "Kubernetes deployment",
    summary: "An ingress, a service and a deployment of three pods, with a config map, a secret and a volume claim.",
    code: `@startuml
!include <k8s/Common>
!include <k8s/OSS/KubernetesIng>
!include <k8s/OSS/KubernetesSvc>
!include <k8s/OSS/KubernetesDeploy>
!include <k8s/OSS/KubernetesPod>
!include <k8s/OSS/KubernetesCm>
!include <k8s/OSS/KubernetesSecret>
!include <k8s/OSS/KubernetesPvc>
left to right direction

actor "User" as user
rectangle "namespace: shop" {
  KubernetesIng(ing, "shop.example.com", "Ingress")
  KubernetesSvc(svc, "web", "Service")
  KubernetesDeploy(deploy, "web", "Deployment, 3 replicas")
  KubernetesPod(pod1, "web-1", "Pod")
  KubernetesPod(pod2, "web-2", "Pod")
  KubernetesPod(pod3, "web-3", "Pod")
  KubernetesCm(cm, "web-config", "ConfigMap")
  KubernetesSecret(secret, "db-password", "Secret")
  KubernetesPvc(pvc, "uploads", "PersistentVolumeClaim")
}

user --> ing
ing --> svc
svc --> pod1
svc --> pod2
svc --> pod3
deploy ..> pod1
deploy ..> pod2
deploy ..> pod3
pod1 ..> cm
pod1 ..> secret
pod1 --> pvc
@enduml
`,
  },
];
