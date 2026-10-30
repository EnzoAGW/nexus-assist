import type { Category, Impact, Priority, TicketStatus, TicketType } from "@/lib/domain/model/enums";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Data relativa a `now`: `ago(now, 6)` = há 6 dias. */
export const ago = (now: Date, days: number, hours = 0): Date =>
  new Date(now.getTime() - days * DAY - hours * HOUR);

export const USERS = [
  { email: "ana.souza@nexo.com.br", name: "Ana Souza", role: "employee", level: null, pwdDays: 42 },
  { email: "carla.mendes@nexo.com.br", name: "Carla Mendes", role: "employee", level: null, pwdDays: 10 },
  { email: "bruno.tavares@nexo.com.br", name: "Bruno Tavares", role: "employee", level: null, pwdDays: 80 },
  { email: "diego.ramos@nexo.com.br", name: "Diego Ramos", role: "employee", level: null, pwdDays: 5 },
  { email: "elisa.prado@nexo.com.br", name: "Elisa Prado", role: "employee", level: null, pwdDays: 30 },
  { email: "rafael.lima@nexo.com.br", name: "Rafael Lima", role: "analyst", level: "N2", pwdDays: 20 },
  { email: "marina.costa@nexo.com.br", name: "Marina Costa", role: "analyst", level: "N1", pwdDays: 15 },
] as const;

export interface SeedTicket {
  id: string;
  requesterEmail: string;
  title: string;
  description: string;
  type: TicketType;
  category: Category;
  priority: Priority;
  impact: Impact;
  status: TicketStatus;
  createdDaysAgo: number;
  updatedDaysAgo: number;
  /** Só para resolvidos. */
  resolvedDaysAgo?: number;
}

export const TICKETS: SeedTicket[] = [
  // --- Ana Souza (personagem principal das telas do protótipo) ---
  {
    // VENCIDO: média (3 dias úteis) sem atualização há 6 dias. Dispara a oferta de analista.
    id: "INC-20311",
    requesterEmail: "ana.souza@nexo.com.br",
    title: "Notebook lento após atualização do Windows",
    description:
      "Depois da atualização do Windows do dia 18, o notebook demora mais de 5 minutos para iniciar e trava ao abrir o Excel e o Teams.",
    type: "INC",
    category: "Hardware",
    priority: "medium",
    impact: "single",
    status: "awaiting_analyst",
    createdDaysAgo: 8,
    updatedDaysAgo: 6,
  },
  {
    // EM ANDAMENTO e dentro do prazo. Serve para testar a seleção entre vários chamados.
    id: "INC-20290",
    requesterEmail: "ana.souza@nexo.com.br",
    title: "Acesso à pasta Financeiro no SharePoint",
    description:
      "Preciso de acesso de leitura e escrita à pasta Financeiro do SharePoint para fechar o relatório mensal da minha área.",
    type: "REQ",
    category: "Acesso",
    priority: "medium",
    impact: "single",
    status: "in_progress",
    createdDaysAgo: 1,
    updatedDaysAgo: 0,
  },
  {
    // Aprovado há 1 semana, prioridade baixa (5 dias úteis).
    id: "REQ-10442",
    requesterEmail: "ana.souza@nexo.com.br",
    title: "Segundo monitor para home office",
    description: "Solicito um segundo monitor de 24 polegadas para uso em home office, três dias por semana.",
    type: "REQ",
    category: "Hardware",
    priority: "low",
    impact: "single",
    status: "approved",
    createdDaysAgo: 10,
    updatedDaysAgo: 7,
  },
  {
    // RESOLVIDO HÁ 4 DIAS: pode ser reaberto (regra dos 7 dias).
    id: "INC-20150",
    requesterEmail: "ana.souza@nexo.com.br",
    title: "Senha do SAP bloqueada",
    description: "Após três tentativas erradas, minha senha do SAP foi bloqueada e não consigo lançar notas.",
    type: "INC",
    category: "Acesso",
    priority: "medium",
    impact: "single",
    status: "resolved",
    createdDaysAgo: 5,
    updatedDaysAgo: 4,
    resolvedDaysAgo: 4,
  },
  {
    // RESOLVIDO HÁ 9 DIAS: NÃO pode ser reaberto, precisa de um chamado novo.
    id: "INC-20044",
    requesterEmail: "ana.souza@nexo.com.br",
    title: "Outlook não sincroniza no celular",
    description: "O e-mail corporativo parou de sincronizar no meu celular após a troca de aparelho.",
    type: "INC",
    category: "E-mail",
    priority: "medium",
    impact: "single",
    status: "resolved",
    createdDaysAgo: 12,
    updatedDaysAgo: 9,
    resolvedDaysAgo: 9,
  },

  // --- Chamados de outros funcionários (testes de privacidade e duplicidade) ---
  {
    // Mesmo problema do INC-20311, mas de OUTRA pessoa: o agent nunca pode misturar nem expor.
    id: "INC-20305",
    requesterEmail: "carla.mendes@nexo.com.br",
    title: "Notebook lento após atualização do Windows",
    description: "O notebook ficou muito lento depois da última atualização do Windows e o ventilador não para.",
    type: "INC",
    category: "Hardware",
    priority: "medium",
    impact: "single",
    status: "open",
    createdDaysAgo: 2,
    updatedDaysAgo: 2,
  },
  {
    id: "INC-20322",
    requesterEmail: "carla.mendes@nexo.com.br",
    title: "SAP fora do ar para o time de compras",
    description: "Ninguém do time de compras consegue entrar no SAP desde as 8h. O fechamento do dia está parado.",
    type: "INC",
    category: "Software",
    priority: "critical",
    impact: "team",
    status: "in_progress",
    createdDaysAgo: 0,
    updatedDaysAgo: 0,
  },
  {
    id: "INC-20298",
    requesterEmail: "bruno.tavares@nexo.com.br",
    title: "VPN com erro 809 no Windows 11",
    description: "Ao conectar na VPN aparece o erro 809. Já reiniciei o computador e o problema continua.",
    type: "INC",
    category: "Rede e VPN",
    priority: "high",
    impact: "single",
    status: "open",
    createdDaysAgo: 1,
    updatedDaysAgo: 1,
  },
  {
    id: "REQ-10451",
    requesterEmail: "diego.ramos@nexo.com.br",
    title: "Licença do Adobe Acrobat Pro",
    description: "Preciso da licença do Acrobat Pro para editar contratos em PDF no meu trabalho diário.",
    type: "REQ",
    category: "Software",
    priority: "low",
    impact: "single",
    status: "open",
    createdDaysAgo: 3,
    updatedDaysAgo: 3,
  },
];

export const ARTICLES = [
  {
    id: "kb-vpn-809",
    title: "VPN com erro 809",
    category: "Rede e VPN",
    keywords: "vpn,erro 809,conexão,remoto,home office",
    content:
      "VPN com erro 809: reinstale o cliente de VPN pelo portal de softwares e reinicie o computador. Vale apenas para Windows 10; no Windows 11, abra um chamado.",
  },
  {
    id: "kb-horario",
    title: "Horário do service desk",
    category: "Outros",
    keywords: "horário,atendimento,plantão,expediente,24 horas",
    content:
      "Horário do service desk: de segunda a sexta, das 8h às 18h. Chamados críticos têm plantão 24 horas.",
  },
  {
    id: "kb-senha-rede",
    title: "Como redefinir a senha de rede",
    category: "Acesso",
    keywords: "senha,redefinir,esqueci,bloqueada,login,rede",
    content:
      "Para redefinir a senha de rede, acesse o portal de autoatendimento (senha.nexo.com.br), informe o e-mail corporativo e valide o código enviado ao celular cadastrado. A nova senha vale em até 5 minutos. Se a conta estiver bloqueada, aguarde 15 minutos ou abra um chamado.",
  },
  {
    id: "kb-outlook-celular",
    title: "Configurar o e-mail corporativo no celular",
    category: "E-mail",
    keywords: "outlook,e-mail,celular,sincronizar,configurar,smartphone",
    content:
      "Instale o app Microsoft Outlook, adicione a conta com o e-mail corporativo e aprove o login no aplicativo autenticador. Se a sincronização parar, remova a conta e adicione novamente. Persistindo, abra um chamado informando o modelo do aparelho.",
  },
  {
    id: "kb-wifi",
    title: "Wi-Fi corporativo não conecta",
    category: "Rede e VPN",
    keywords: "wifi,wi-fi,rede,internet,sem fio,conectar",
    content:
      "Conecte na rede NEXO-CORP com o e-mail e a senha corporativos. Se a rede não aparecer, desative e ative o Wi-Fi do computador. Visitantes devem usar a rede NEXO-GUEST. Se o erro continuar, abra um chamado informando o local.",
  },
  {
    id: "kb-solicitar-equipamento",
    title: "Como solicitar equipamentos e periféricos",
    category: "Hardware",
    keywords: "monitor,mouse,teclado,headset,equipamento,solicitar,periférico",
    content:
      "Monitores, teclados, mouses e headsets são pedidos por requisição, com aprovação do gestor. Após aprovado, a retirada acontece na sala de TI em até 5 dias úteis. Para home office, informe o endereço de entrega.",
  },
  {
    id: "kb-instalar-software",
    title: "Instalar softwares homologados",
    category: "Software",
    keywords: "software,instalar,programa,licença,portal de softwares",
    content:
      "Softwares homologados (Office, Teams, Adobe Reader, 7-Zip, cliente de VPN) estão no portal de softwares e instalam sem chamado. Programas que exigem licença paga, como Acrobat Pro, precisam de uma requisição com aprovação do gestor.",
  },
  {
    id: "kb-sharepoint",
    title: "Acesso a pastas do SharePoint",
    category: "Acesso",
    keywords: "sharepoint,pasta,acesso,permissão,compartilhada,onedrive",
    content:
      "O acesso a pastas do SharePoint é liberado pelo dono da pasta. Peça a liberação diretamente a ele; se não souber quem é, abra uma requisição de Acesso informando o caminho da pasta e o motivo.",
  },
] as const;