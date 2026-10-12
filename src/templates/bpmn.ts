import type { Template } from "./index";

const head = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
             id="defs" targetNamespace="https://figvex.sudo520.com/bpmn">`;

export const bpmnTemplates: Template[] = [
  {
    id: "bpmn-loan",
    engine: "bpmn",
    category: "Business processes",
    title: "Library loan",
    summary: "Two lanes, an exclusive gateway and a timer on the loan period.",
    code: `${head}
  <!-- No layout is saved in this file, so Figvex lays it out. -->
  <process id="loan" isExecutable="false">
    <laneSet id="lanes">
      <lane id="member" name="Member">
        <flowNodeRef>request</flowNodeRef>
        <flowNodeRef>collect</flowNodeRef>
        <flowNodeRef>refused</flowNodeRef>
      </lane>
      <lane id="librarian" name="Librarian">
        <flowNodeRef>check</flowNodeRef>
        <flowNodeRef>available</flowNodeRef>
        <flowNodeRef>issue</flowNodeRef>
        <flowNodeRef>overdue</flowNodeRef>
        <flowNodeRef>remind</flowNodeRef>
        <flowNodeRef>returned</flowNodeRef>
      </lane>
    </laneSet>

    <startEvent id="request" name="Book requested" />
    <userTask id="check" name="Check availability" />
    <exclusiveGateway id="available" name="Available?" default="no" />
    <userTask id="issue" name="Issue book" />
    <manualTask id="collect" name="Collect book" />
    <boundaryEvent id="overdue" name="14 days" attachedToRef="collect" cancelActivity="false">
      <timerEventDefinition />
    </boundaryEvent>
    <sendTask id="remind" name="Send reminder" />
    <endEvent id="returned" name="Book returned" />
    <endEvent id="refused" name="Request refused" />

    <sequenceFlow id="f1" sourceRef="request" targetRef="check" />
    <sequenceFlow id="f2" sourceRef="check" targetRef="available" />
    <sequenceFlow id="yes" name="yes" sourceRef="available" targetRef="issue" />
    <sequenceFlow id="no" name="no" sourceRef="available" targetRef="refused" />
    <sequenceFlow id="f3" sourceRef="issue" targetRef="collect" />
    <sequenceFlow id="f4" sourceRef="collect" targetRef="returned" />
    <sequenceFlow id="f5" sourceRef="overdue" targetRef="remind" />
  </process>
</definitions>
`,
  },
  {
    id: "bpmn-order",
    engine: "bpmn",
    category: "Business processes",
    title: "Online order",
    summary: "Customer and shop pools joined by message flows.",
    code: `${head}
  <collaboration id="collab">
    <participant id="customer" name="Customer" processRef="buying" />
    <participant id="shop" name="Web shop" processRef="selling" />
    <messageFlow id="m1" name="order" sourceRef="place" targetRef="received" />
    <messageFlow id="m2" name="invoice" sourceRef="invoice" targetRef="pay" />
    <messageFlow id="m3" name="payment" sourceRef="pay" targetRef="paid" />
  </collaboration>

  <process id="buying" isExecutable="false">
    <startEvent id="want" name="Item needed" />
    <sendTask id="place" name="Place order" />
    <userTask id="pay" name="Pay invoice" />
    <endEvent id="done" name="Order paid" />
    <sequenceFlow id="b1" sourceRef="want" targetRef="place" />
    <sequenceFlow id="b2" sourceRef="place" targetRef="pay" />
    <sequenceFlow id="b3" sourceRef="pay" targetRef="done" />
  </process>

  <process id="selling" isExecutable="false">
    <startEvent id="received" name="Order received">
      <messageEventDefinition />
    </startEvent>
    <serviceTask id="stock" name="Reserve stock" />
    <sendTask id="invoice" name="Send invoice" />
    <intermediateCatchEvent id="paid" name="Payment received">
      <messageEventDefinition />
    </intermediateCatchEvent>
    <userTask id="ship" name="Ship order" />
    <endEvent id="shipped" name="Order shipped" />
    <sequenceFlow id="s1" sourceRef="received" targetRef="stock" />
    <sequenceFlow id="s2" sourceRef="stock" targetRef="invoice" />
    <sequenceFlow id="s3" sourceRef="invoice" targetRef="paid" />
    <sequenceFlow id="s4" sourceRef="paid" targetRef="ship" />
    <sequenceFlow id="s5" sourceRef="ship" targetRef="shipped" />
  </process>
</definitions>
`,
  },
  {
    id: "bpmn-marking",
    engine: "bpmn",
    category: "Business processes",
    title: "Assignment marking",
    summary: "Parallel marking by two tutors, a data object and a note.",
    code: `${head}
  <process id="marking" isExecutable="false">
    <startEvent id="deadline" name="Deadline passed">
      <timerEventDefinition />
    </startEvent>
    <serviceTask id="collect" name="Collect submissions">
      <dataOutputAssociation id="out">
        <targetRef>submissions</targetRef>
      </dataOutputAssociation>
    </serviceTask>
    <dataObjectReference id="submissions" name="Submissions" dataObjectRef="submissionsData" />
    <dataObject id="submissionsData" />
    <parallelGateway id="split" />
    <userTask id="markA" name="First marker grades" />
    <userTask id="markB" name="Second marker grades" />
    <parallelGateway id="join" />
    <exclusiveGateway id="agree" name="Marks within 10%?" default="moderate" />
    <userTask id="moderate" name="Moderate marks" />
    <exclusiveGateway id="merge" />
    <serviceTask id="publish" name="Publish grades" />
    <endEvent id="published" name="Grades published" />
    <textAnnotation id="note">
      <text>Moderator reads both reports</text>
    </textAnnotation>
    <association id="a1" sourceRef="note" targetRef="moderate" />

    <sequenceFlow id="f1" sourceRef="deadline" targetRef="collect" />
    <sequenceFlow id="f2" sourceRef="collect" targetRef="split" />
    <sequenceFlow id="f3" sourceRef="split" targetRef="markA" />
    <sequenceFlow id="f4" sourceRef="split" targetRef="markB" />
    <sequenceFlow id="f5" sourceRef="markA" targetRef="join" />
    <sequenceFlow id="f6" sourceRef="markB" targetRef="join" />
    <sequenceFlow id="f7" sourceRef="join" targetRef="agree" />
    <sequenceFlow id="ok" name="yes" sourceRef="agree" targetRef="merge" />
    <sequenceFlow id="moderate" name="no" sourceRef="agree" targetRef="moderate" />
    <sequenceFlow id="f8" sourceRef="moderate" targetRef="merge" />
    <sequenceFlow id="f9" sourceRef="merge" targetRef="publish" />
    <sequenceFlow id="f10" sourceRef="publish" targetRef="published" />
  </process>
</definitions>
`,
  },
  {
    id: "bpmn-saved-layout",
    engine: "bpmn",
    category: "Business processes",
    title: "Expense claim (saved layout)",
    summary: "The bpmn: prefix and BPMNDI positions, as Camunda and bpmn.io save them.",
    code: `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
                  id="defs" targetNamespace="https://figvex.sudo520.com/bpmn">
  <bpmn:process id="claim" isExecutable="false">
    <bpmn:startEvent id="submit" name="Claim submitted" />
    <bpmn:userTask id="review" name="Review claim" />
    <bpmn:exclusiveGateway id="approved" name="Approved?" />
    <bpmn:serviceTask id="pay" name="Pay expenses" />
    <bpmn:endEvent id="paid" name="Claim paid" />
    <bpmn:endEvent id="rejected" name="Claim rejected" />
    <bpmn:sequenceFlow id="f1" sourceRef="submit" targetRef="review" />
    <bpmn:sequenceFlow id="f2" sourceRef="review" targetRef="approved" />
    <bpmn:sequenceFlow id="yes" name="yes" sourceRef="approved" targetRef="pay" />
    <bpmn:sequenceFlow id="no" name="no" sourceRef="approved" targetRef="rejected" />
    <bpmn:sequenceFlow id="f3" sourceRef="pay" targetRef="paid" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="diagram">
    <bpmndi:BPMNPlane id="plane" bpmnElement="claim">
      <bpmndi:BPMNShape id="submit_di" bpmnElement="submit">
        <dc:Bounds x="152" y="102" width="36" height="36" />
        <bpmndi:BPMNLabel><dc:Bounds x="130" y="145" width="80" height="27" /></bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="review_di" bpmnElement="review">
        <dc:Bounds x="240" y="80" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="approved_di" bpmnElement="approved" isMarkerVisible="true">
        <dc:Bounds x="395" y="95" width="50" height="50" />
        <bpmndi:BPMNLabel><dc:Bounds x="392" y="65" width="56" height="14" /></bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="pay_di" bpmnElement="pay">
        <dc:Bounds x="500" y="80" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="paid_di" bpmnElement="paid">
        <dc:Bounds x="652" y="102" width="36" height="36" />
        <bpmndi:BPMNLabel><dc:Bounds x="640" y="145" width="60" height="14" /></bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="rejected_di" bpmnElement="rejected">
        <dc:Bounds x="502" y="212" width="36" height="36" />
        <bpmndi:BPMNLabel><dc:Bounds x="550" y="223" width="80" height="14" /></bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="f1_di" bpmnElement="f1">
        <di:waypoint x="188" y="120" /><di:waypoint x="240" y="120" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="f2_di" bpmnElement="f2">
        <di:waypoint x="340" y="120" /><di:waypoint x="395" y="120" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="yes_di" bpmnElement="yes">
        <di:waypoint x="445" y="120" /><di:waypoint x="500" y="120" />
        <bpmndi:BPMNLabel><dc:Bounds x="463" y="102" width="20" height="14" /></bpmndi:BPMNLabel>
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="no_di" bpmnElement="no">
        <di:waypoint x="420" y="145" /><di:waypoint x="420" y="230" /><di:waypoint x="502" y="230" />
        <bpmndi:BPMNLabel><dc:Bounds x="428" y="180" width="16" height="14" /></bpmndi:BPMNLabel>
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="f3_di" bpmnElement="f3">
        <di:waypoint x="600" y="120" /><di:waypoint x="652" y="120" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
`,
  },
];
