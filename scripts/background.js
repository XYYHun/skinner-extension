/* extenal functions */

var add_domain_to_profile;
var remove_domain_from_profile;

var update_profile_table;

var get_options;
var set_options;

var get_profile_id;
var get_template_ids;

let profile_table = {};
let template_table = {};

(function() /* Close */
{
  /* local variables */

  // TODO: consider use other storage mech.
  let storage_s = chrome.storage.sync || chrome.storage.local;
  let storage_l = chrome.storage.local;

  let profiles_to_create = [];
  let profiles_to_remove = [];

  /* local functions */

  let get_generated_style;

  /* extenal functions */

  add_domain_to_profile = function(domain, profile_id)
  {
    if (profile_id == 'default')
      return;

    let profile_data = profile_table[profile_id];

    if (!profile_data)
    {
      profile_data = {matches:[]};
      profile_table[profile_id] = profile_data;
    }

    profile_data.matches.push({type: 'domain', value: domain});
  };

  remove_domain_from_profile = function(domain, profile_id)
  {
    let profile_data = profile_table[profile_id];

    if (profile_data && profile_data.matches)
    {
      let new_matches = []

      for (var index in profile_data.matches)
      {
        if (profile_data.matches[index].value != domain)
          new_matches.push(profile_data.matches[index])
      }

      profile_data.matches = new_matches;
    }
  };

  update_profile_table = function()
  {
    storage_s.set({'profile-table': profile_table});
  };

  get_options = function(profile_id, callback)
  {
    const options_id = profile_id ? 'options-' + profile_id : 'options'

    storage_s.get(options_id, function(data)
    {
      if (options_id in data)
        callback(data[options_id]);
      else
        callback({});
    });
  };

  set_options = function(profile_id, options)
  {
    const options_id = profile_id ? 'options-' + profile_id : 'options'

    let set_param = {};

    set_param[options_id] = options;

    storage_s.set(set_param, function()
    {
      // TODO::
      storage_l.get(null, function(data)
      {
        const generated_style_pattern = /^generated-style:([\w\-]*):([\w\-]*)$/;

        for (let key in data)
        {
          key.replace(generated_style_pattern, function(full_match, key_profile_id, key_template_id)
          {
            if (key_profile_id == (profile_id ? profile_id : ''))
              get_generated_style(profile_id, key_template_id, null, true);
          })
        }
      });
    });
  };

  get_profile_id = function(url)
  {
    for (let profile_id in profile_table)
    {
      let profile = profile_table[profile_id];

      if (profile.matches)
        for (let index in profile.matches)
        {
          let match = profile.matches[index];
          let match_regexp;

          switch (match.type)
          {
          case 'domain':
            let domain;
            //TODO: new plan: url => domain, then compares.
            match_regexp = RegExp(
              '^https?:\\/\\/(?:[^\\/]*@)?(?:[^\\s\\/:]+\\.)*' +
              match.value.replace('.', '\\\.') + '(?::[\\d]*)?\\/.*');
            break;
          case 'regexp':
          default:
            match_regexp = RegExp(match.value);
            break;
          }

          if (match_regexp.test(url))
            return profile_id;
        }
    }

    return 'default';
  }

  get_template_ids = function(url)
  {
    result = []

    for (let id in template_table)
    {
      let template = template_table[id];

      if (template['match-regexp'] && (new RegExp(template['match-regexp'])).test(url))
        result.push(id);
    }

    return result;
  }

  // NOTICE: callback is not promised.
  get_generated_style = function(profile_id, template_id, callback, force_update)
  {
    if (profile_id == 'disabled')
      return;

    const generated_style_id = ['generated-style', profile_id, template_id].join(':');

    storage_l.get(generated_style_id, function(data)
    {
      if ((generated_style_id in data) && !force_update)
      {
        if (callback)
          callback(data[generated_style_id]);
      }
      else
      {
        get_options(profile_id, function(options)
        {
          let template_info = template_table[template_id];

          if (template_info.type == 'addon')
            $.get(template_info.url, function(template)
            {
              let set_param = {}

              set_param[generated_style_id] = style_template.generate(template, options);

              chrome.storage.local.set(set_param);
            }, "text");
        });
      }
    });

    return generated_style_id;
  }

  /* initial */

  storage_s.get(['profile-table', 'template-table'], function(data)
  {
    profile_table = data['profile-table'] || {};

    template_table = data['template-table'] || {};
    
    if (!template_table['addon-google-plus'])
      template_table['addon-google-plus'] = {
        'type': 'addon',
        'url': './templates/google-plus.template.css',
        'match-regexp': '^https:\/\/plus\.google\.com\/',
      };

    if (!template_table['addon-facebook'])
      template_table['addon-facebook'] = {
        'type': 'addon',
        'url': './templates/facebook.template.css',
        'match-regexp': '^https?:\/\/(?:[\w\d]+\.)?facebook\.com\/',
      };

    if (!template_table['addon-twitter'])
      template_table['addon-twitter'] = {
        'type': 'addon',
        'url': './templates/twitter.template.css',
        'match-regexp': '^https?:\/\/(?:[\w\d]+\.)?twitter\.com\/',
      };
  });

  chrome.runtime.onMessage.addListener(
    function(request, sender, sendResponse)
    {
      let response = {};

      if (request['request-profile-id'])
        response['profile-id'] = get_profile_id(request.url);

      if (request['request-template-ids'])
        response['template-ids'] = get_template_ids(request.url);

      if (request['request-generated-style'])
        response['generated-style-id'] = get_generated_style(
          request['profile-id'],
          request['template-id'],
          function(style)
          {
            chrome.tabs.sendMessage(
              sender.tab.id,
              {
                'update-style' : true,
                'index' : request.index,
                'style' : style,
              });
          });

      sendResponse(response);
    });
})();