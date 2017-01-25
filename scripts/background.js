/* extenal functions */

var get_profile_id;
var get_template_ids;

var get_options;
var set_options;

var add_domain_to_profile;
var remove_domain_from_profile;

var commit_profile_table;

var get_subscription_table;

var install_subscription;
var remove_subscription;

{
  /* local variables */
  let profile_table;
  let subscription_table = {};
  let template_table;

  let generated_style_cache = {};

  // TODO: consider use other storage mech.
  let storage_s = chrome.storage.sync || chrome.storage.local;
  let storage_l = chrome.storage.local;

  /* local functions */

  let get_generated_style;

  let test_matches;

  /* extenal functions */

  get_profile_id = function(url)
  {
    for (let profile_id in profile_table)
    {
      let profile = profile_table[profile_id];

      if (test_matches(url, profile_table[profile_id].matches))
        return profile_id;
    }

    return 'disabled';
  }

  get_template_ids = function(url)
  {
    result = []

    for (let id in template_table)
    {
      if (test_matches(url, template_table[id].matches))
        result.push(id);
    }

    return result;
  }

  get_options = function(profile_id, callback)
  {
    const options_id = 'options-' + profile_id;

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
    const generated_style_pattern = /^generated-style:(.*?):(.*)$/;

    for (let cached_style_id in generated_style_cache)
    {
      // TODO: use regexp match.
      cached_style_id.replace(generated_style_pattern, function(full_match, cache_profile_id, template_id)
      {
        if (cache_profile_id == profile_id)
        {
          delete generated_style_cache[cached_style_id];
        }
      });
    }

    storage_s.set({['options-' + profile_id]: options});
  };

  add_domain_to_profile = function(domain, profile_id)
  {
    if (profile_id == 'disabled')
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

      for (let index in profile_data.matches)
      {
        if (profile_data.matches[index].value != domain)
          new_matches.push(profile_data.matches[index])
      }

      profile_data.matches = new_matches;
    }
  };

  commit_profile_table = function()
  {
    storage_s.set({'profile-table': profile_table});

    // TODO: temp solution.
    storage_l.set({'force-update': (new Date()).toJSON()});
  };

  get_subscription_table = function()
  {
    return subscription_table;
  }

  install_subscription = function(subscription_url, on_done)
  {
    let proper_url = subscription_url.replace(/(|\/|\/manifest\.json)?$/, '/');

    $.getJSON(proper_url + 'manifest.json', function(subscription)
    {
      if (!subscription || !subscription.id)
        return;

      function do_install()
      {
        subscription.url = proper_url;

        subscription_table[subscription.id] = subscription;

        for (let template_index in subscription.templates)
        {
          let template = subscription.templates[template_index];

          if (template.url)
            template.url = proper_url + template.url;

          template_table[[subscription.id, template_index].join(':')] = template;
        }

        storage_s.set({
          'subscription-table': subscription_table,
          'template-table': template_table,
        });

        if (on_done)
          on_done();

        storage_l.set({'force-update': (new Date()).toJSON()});
      }

      if (subscription_table && subscription.id in subscription_table)
        remove_subscription(subscription.id, do_install, true);
      else
        do_install();
    });
  }

  remove_subscription = function(subscription_id, on_done, no_update_storage)
  {
    subscription = subscription_table[subscription_id];

    if (!subscription)
    {
      if (on_done)
        return on_done();
      else
        return;
    }

    let to_remove = []

    // remove template.
    for (let template_index in subscription.templates)
    {
      let template_id = [subscription.id, template_index].join(':');

      delete template_table[template_id];

      to_remove.push(['template-cache', template_id].join(':'));
    }

    // remove subscription.
    delete subscription_table[subscription_id];

    // remove caches.
    if (to_remove.length)
      storage_l.remove(to_remove, on_done);
    else
    {
      if (on_done)
        return on_done();
      else
        return;
    }

    generated_style_cache = {};

    // update storage.
    if (!no_update_storage)
    {
      storage_s.set({
        'subscription-table': subscription_table,
        'template-table': template_table,
      })

      storage_l.set({'force-update': (new Date()).toJSON()});
    }
  }

  // TODO: profile_id || options
  get_generated_style = function(profile_id, template_id, callback, options)
  {
    const generated_style_id = ['generated-style', profile_id, template_id].join(':');

    if (profile_id == 'disabled')
      return;

    if (!options)
    {
      if (generated_style_id in generated_style_cache)
      {
        if (callback)
          callback(generated_style_cache[generated_style_id]);
      }
      else
      {
        get_options(profile_id, function(options)
        {
          get_generated_style(profile_id, template_id, callback, options);
        });
      }

      return generated_style_id;
    }

    const template_cache_id = ['template-cache', template_id].join(':');

    storage_l.get(template_cache_id, function(data)
    {
      if (template_cache_id in data)
      {
        generated_style_cache[generated_style_id] = style_template.generate(data[template_cache_id], options);

        callback(generated_style_cache[generated_style_id]);
      }
      else
      {
        $.get(template_table[template_id].url, function(template)
        {
          storage_l.set({[template_cache_id]: template});

          generated_style_cache[generated_style_id] = style_template.generate(template, options);

          callback(generated_style_cache[generated_style_id]);
        }, "text");
      }
    });

    return generated_style_id;
  }

  test_matches = function(url, matches)
  {
    for (let index in matches)
    {
      let match = matches[index];

      switch (match.type)
      {
      case 'domain':
        {
          let match_result = url.match(/^[^:]*:\/\/(?:[^@\s]*?@)?([^:\/]*?)(?::[^\/]*)?\//);

          if (match_result && match_result[1].endsWith(match.value))
            return true;
        }

        break;

      case 'regexp':
      default:
        {
          if ((new RegExp(match.value)).test(url))
            return true;
        }

        break;
      }

    }

    return false;
  }

  /* initial */

  function initial_storage_l()
  {
    const storage_version = '0.1.4';

    storage_l.get(['initialled', 'storage-version'], function(data)
    {
      let to_set = {};

      if (!('initialled' in data))
      {
        to_set['enabled'] = true;
        to_set['initialled'] = true;
        add_domain_to_profile('plus.google.com', 'default');
      }

      if (data['storage-version'] != storage_version)
      {
        to_set['storage-version'] = storage_version;

        // remove all styles cached in local storage.
        storage_l.get(null, function(data)
        {
          const generated_style_id_pattern = /^generated-style/;

          let to_remove = [];

          for (let key in data)
          {
            if (key.match(generated_style_id_pattern))
              to_remove.push(key);
          }

          storage_l.remove(to_remove);
        });
      }

      if (Object.keys(to_set).length)
        storage_l.set(to_set);
    });
  }

  storage_s.get(['profile-table', 'subscription-table', 'template-table'], function(data)
  {
    profile_table = data['profile-table'] || {};

    if (!data['subscription-table'])
      install_subscription('https://raw.githubusercontent.com/XYYHun/skinner-official-subscription/master');
    else
      subscription_table = data['subscription-table'];

    template_table = data['template-table'] || {};

    initial_storage_l();
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
      {
        for (let index in request['template-id-list'])
        {
          response['generated-style-id'] = get_generated_style(
            request['profile-id'],
            request['template-id-list'][index],
            function(style)
            {
              chrome.tabs.sendMessage(
                sender.tab.id,
                {
                  'response-generated-style' : true,
                  'index' : index,
                  'style' : style,
                });
            });
        }
      }

      sendResponse(response);
    });
};