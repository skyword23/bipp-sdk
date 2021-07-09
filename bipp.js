const ApiConst = {
  VERSION: '1.0.1',
  AUTH_TOKEN: 'authToken',
  ADD_FILTER: 'addFilter',
  REMOVE_FILTER: 'removeFilter',
  DECORATE: 'decorate',
  OPTIONS: 'options',
  MSG_PREFIX: 'Bipp Embedded SDK:',
  WAIT_PERIOD_SECONDS: 5,
};

(function () {
  const SDK_Error = ApiConst.MSG_PREFIX + ' Error';

  class Bipp {
    constructor() {
      this.auth_done = false;
      this.auth_detail = null;
      this.iframe = null;
      this.server = null;
      this.url = null;
      this.signed_url = null;
      
      this.lastLoginTime = null;

      console.log(`${ApiConst.MSG_PREFIX} Version ${ApiConst.VERSION}`);

      window.onmessage = async (e) => {
        if (e.data.type == 'relogin') {
          this.reLogin();
        }
        else if (this.onmessage) {
          this.onmessage(e);
        }
      };
    }

    async reLogin() {

      if (!this.lastLoginTime) {
        this.lastLoginTime = new Date().getTime();
      } else if (
        (new Date().getTime() - this.lastLoginTime) / 1000 <
        ApiConst.WAIT_PERIOD_SECONDS
      ) {
        // do not send multiple login requests
        return;
      }
      console.log('doing relogin...')
      this.lastLoginTime = new Date().getTime();
      this.auth_done = false;
      await this.load({element: this.element, config: this.config});
    }

    error(e) {
      console.error(`${ApiConst.MSG_PREFIX} ${e}`);
    }

    init({server, auth_detail, url}) {
      const { app_id, client_id, client_secret } = auth_detail;

      const sign = 'USAGE: init({server, {app_id, client_id, client_secret}, url})';

      if (!app_id) throw `${SDK_Error} ${sign}, missing app_id`;
      if (!client_id) throw `${SDK_Error} ${sign},missing client_id`;
      if (!client_secret) throw `${SDK_Error} ${sign}, missing client_secret`;
      if (!server) throw `${SDK_Error} ${sign}, missing server`;
      if (!url) throw `${SDK_Error} ${sign}, missing url`;

      this.server = server;
      this.signed_url = url;
      this.auth_detail = auth_detail;
    }

    async login() {
      const { app_id, client_id, client_secret } = this.auth_detail;

      const headers = {
        'X-Org-ID': 'dummy',
      };
      const data = {
        app_id,
        client_id,
        client_secret,
      };

      const url = `${this.server}/app/v1/extapps/${app_id}/login`;

      try {
        const res = await axios
          .post(url, data, {
            headers,
          });

        if (res) {
          this.auth_detail.paymentToken = res.data.subscription;
          this.auth_detail.app_token = res.data.app_token;
          this.auth_detail.org_id = res.data.org_id;

          return await this.setEmbedToken();
        }
      }
      catch (error) {
        this.error(`unable to login, ${error}`);
      }
      return false;
    }

    async setEmbedToken() {
      const { paymentToken, app_token, org_id } = this.auth_detail;

      const headers = {
        'X-Org-ID': org_id,
        'X-Payment-Token': paymentToken,
        Authorization: `Bearer ${app_token}`,
      };

      try {
        const res = await axios
          .get(this.signed_url, {
            headers,
          });

        if (res) {
          this.url = res.data.url;
          this.auth_detail.embedToken = res.data.embed_token;
          return true;
        }
      }
      catch(error) {
        this.error(`unable to get embed token. ${error}`);
      }
      return false;
    }

    parse(url) {
      // const url = "http://zwchaz.localhost:8080/embed/a4706a61-6a38-4993-8a99-5fc0c9d4329a?id=f86ea41b-13a5-4be4-bcd5-0e2720457df8&cid=7eab5475d5254d9aa95b8022fbc8bf28.zwchaz.localhost&secret=JDJhJDEwJFY2eXhOWm4uNk5DMy9MVnJ6Q01wZGUxNmZXd2dKd1NwS1lBRUN3NFBNN1poM0ZtMlFHTFRT";

      console.log("url", url);
      let toks = url.split("?");

      const embed_url = toks[0];

      this.server = embed_url.split("/embed")[0]
      this.signed_url = embed_url;

      const args = toks[1];

      toks = args.split("&");
      const app_id = toks[0].split("=")[1];
      const client_id = toks[1].split("=")[1];
      const client_secret = toks[2].split("=")[1];

      this.auth_detail = {
        app_id,
        client_id,
        client_secret
      }
    }

    async load(url, config) {

      this.parse(url); // TODO relogin use case
      const { id, width = '600px', height='400px', style = ''} = config;

      if (!id) throw `${SDK_Error} ${sign}, missing id`;
      // if (!config) config = { width: '600px', height: '400px', style: '' };

      const res = await this.login();
      if (!res) return;

      this.element = document.getElementById(id);
      this.config = config;

      if (this.iframe && element.contains(this.iframe)) {
        element.removeChild(this.iframe);
      }

      let iframe = document.createElement('iframe');
      this.iframe = iframe;

      const sign = 'USAGE: load({<element>, <url>, [<config>]})';

      iframe.width = width;
      iframe.height = height;
      iframe.style = style;
      iframe.src = this.url;

      this.element.appendChild(iframe);

      iframe.onload = () => {
        
        if (!this.auth_done && this.auth_detail) {
          this.auth_done = true;
          iframe.contentWindow.postMessage(
            {
              type: ApiConst.AUTH_TOKEN,
              payload: this.auth_detail,
            },
            '*'
          );
        }
      };
    }

    addFilter(filters) {
      filters.forEach((e) => {
        if (!e.table || !e.column || !e.value)
          throw `${SDK_Error} invalid filter`;
      });

      if (this.iframe) {
        this.iframe.contentWindow.postMessage(
          {
            type: ApiConst.ADD_FILTER,
            payload: filters,
          },
          '*'
        );
      }
    }

    removeFilter(filters) {
      filters.forEach((e) => {
        if (!e.table || !e.column) throw `${SDK_Error} invalid filter`;
      });

      if (this.iframe) {
        this.iframe.contentWindow.postMessage(
          {
            type: ApiConst.REMOVE_FILTER,
            payload: filters,
          },
          '*'
        );
      }
    }

    setOptions(args) {
      if (this.iframe) {
        this.iframe.contentWindow.postMessage(
          {
            type: ApiConst.OPTIONS,
            payload: args,
          },
          '*'
        );
      }
    }

    // experimental
    decorate(args) {
      if (this.iframe) {
        this.iframe.contentWindow.postMessage(
          {
            type: ApiConst.DECORATE,
            payload: args,
          },
          '*'
        );
      }
    }
  }
  window.Bipp = Bipp;
})();