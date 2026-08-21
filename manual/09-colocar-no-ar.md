# 09. Colocar no ar

Sair do "roda na minha máquina". Enquanto o CRM depende do seu computador estar
ligado e do túnel estar de pé, ele para quando você fecha o notebook.

---

## O que muda, e por quê

Rodando na sua máquina, o CRM tem dois pontos frágeis, e os dois são o mesmo
problema: **o endereço público**.

O túnel rápido do Cloudflare é anônimo e descartável por natureza. Ele cai, e
quando volta, **volta com outro nome**. O `npm run tunel` conserta isso em dois
minutos, mas conserta uma coisa que não deveria acontecer.

Em produção, o endereço é **fixo**. Ele não muda quando o processo reinicia, não
muda quando a máquina reinicia, e o webhook da uazapi nunca mais precisa ser
reapontado.

Essa é a mudança que importa. O resto é consequência.

---

## O que você vai precisar

| O quê | Para quê | Custo aproximado |
|---|---|---|
| Um servidor (VPS) | manter o CRM ligado | 5 a 20 USD por mês |
| Um domínio | o endereço fixo | ~40 BRL por ano |

Qualquer VPS pequena serve: 2 GB de memória dão conta com folga. Hetzner,
DigitalOcean, Vultr, Contabo.

---

## O desenho

```
  crm.suaempresa.com.br    ──►  a tela
  api.suaempresa.com.br    ──►  a API        (porta 4000)
  zap.suaempresa.com.br    ──►  a ponte      (porta 4200)
```

Três subdomínios apontando para o mesmo servidor, com um proxy na frente
cuidando do HTTPS.

Só o `zap` precisa mesmo ser público: é ele que a uazapi chama. Mas separar os
três deixa o log legível e permite fechar um sem fechar os outros.

---

## Os passos

### 1. Aponte o domínio

No seu provedor de domínio, crie três registros `A` apontando para o IP do
servidor.

### 2. Prepare o servidor

Instale Node 20+, `git` e um proxy com HTTPS automático. O
[Caddy](https://caddyserver.com) é o caminho mais curto: ele tira o certificado
sozinho, sem comando nenhum.

Um `Caddyfile` que resolve os três:

```
crm.suaempresa.com.br {
  root * /opt/crm/dist
  file_server
  try_files {path} /index.html
}

api.suaempresa.com.br {
  reverse_proxy 127.0.0.1:4000
}

zap.suaempresa.com.br {
  reverse_proxy 127.0.0.1:4200
}
```

### 3. Leve o código

Copie a pasta do projeto para `/opt/crm` (por `git`, `scp` ou o que preferir) e
rode:

```bash
npm install
npm --prefix backend install
npm --prefix whatsapp install
```

### 4. Ajuste o `.env`

Este é o passo que faz a diferença. Troque os endereços locais pelos de verdade:

```env
NODE_ENV=production

CORS_ORIGIN=https://crm.suaempresa.com.br
APP_URL=https://crm.suaempresa.com.br
VITE_API_URL=https://api.suaempresa.com.br
PUBLIC_API_URL=https://api.suaempresa.com.br

BACKEND_URL=http://127.0.0.1:4000
WHATSAPP_BRIDGE_URL=http://127.0.0.1:4200

# O ENDEREÇO FIXO. É esta linha que aposenta o túnel.
WHATSAPP_BRIDGE_PUBLIC_URL=https://zap.suaempresa.com.br
```

No Supabase, em **Authentication → URL Configuration**, ponha
`https://crm.suaempresa.com.br` como Site URL.

### 5. Compile

```bash
npm run build
npm run build:backend
npm run build:whatsapp
```

O `npm run build` gera a pasta `dist/`, que é o que o Caddy serve.

### 6. Mantenha de pé

Os dois processos precisam voltar sozinhos quando a máquina reiniciar. Com
`systemd`, um arquivo por processo em `/etc/systemd/system/`:

```ini
[Unit]
Description=CRM API
After=network.target

[Service]
WorkingDirectory=/opt/crm/backend
ExecStart=/usr/bin/node dist/index.js
Restart=always
User=crm

[Install]
WantedBy=multi-user.target
```

O mesmo para a ponte, apontando para `/opt/crm/whatsapp`.

```bash
sudo systemctl enable --now crm-api crm-zap
```

`Restart=always` é o ponto. Sem ele, o primeiro erro não tratado derruba o
atendimento até alguém perceber.

### 7. Reaponte a uazapi

Abra **Conexões** no CRM e reconecte, ou espere o vigia: ele confere de dois em
dois minutos, vê que o endereço mudou e reaponta o webhook sozinho.

### 8. Prove

Mande uma mensagem de outro celular. Ela tem que aparecer em Chats ao vivo.

Depois **reinicie o servidor** e mande outra. Essa segunda prova é a que
importa: ela mostra que tudo volta sozinho.

---

## Backup

O Supabase faz backup automático no plano pago. No plano grátis, não.

Se o seu CRM tem conversa de cliente dentro, saia do plano grátis. Um banco sem
backup é uma questão de tempo.

---

## O que conferir de vez em quando

- **O sinal da automação** está verde? É o resumo de tudo.
- O certificado renovou? O Caddy cuida sozinho, mas vale olhar.
- O disco encheu? Log e mídia crescem.

---

Próxima: [10. Quando algo quebra](10-quando-algo-quebra.md).
